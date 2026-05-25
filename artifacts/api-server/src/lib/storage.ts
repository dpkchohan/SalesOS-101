import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { eq, sql } from "drizzle-orm";
import { db, storageUsageTable, QUOTA_BYTES, type StorageTier } from "@workspace/db";

const BUCKET = process.env.AWS_S3_BUCKET ?? "salesos-production-storage";
const REGION = process.env.AWS_REGION ?? "ap-south-1";

function getS3Client(): S3Client {
  return new S3Client({
    region: REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  });
}

export type StorageFolder =
  | "temp/imports"
  | "temp/extractions"
  | "documents/contacts"
  | "documents/deals"
  | "attachments/contacts"
  | "attachments/deals"
  | "feedback";

// ── Internal: resolve which row + key-prefix to use for a given user ──────────

interface StorageContext {
  tier: StorageTier;
  /** S3 key prefix (userId/ for free/premium, orgId/ for org) */
  keyPrefix: string;
  /** Current usage + quota from the correct row */
  usedBytes: number;
  quotaBytes: number;
}

/**
 * Determines a user's tier and finds (or initialises) the correct quota row.
 *
 * Logic:
 *  1. Look for a row keyed by userId.
 *  2. If the row has tier='org', instead look for the *org's* shared row
 *     (identified by orgId unique index) and use that for quota accounting.
 *  3. If no row exists at all → create a free row for the user.
 */
async function resolveStorageContext(
  userId: string,
  orgId: string,
): Promise<StorageContext> {
  // ── 1. Check user's own row ──────────────────────────────────────────────
  const [userRow] = await db
    .select()
    .from(storageUsageTable)
    .where(eq(storageUsageTable.userId, userId));

  const tier: StorageTier = (userRow?.tier as StorageTier) ?? "free";

  // ── 2. Org tier: use the shared org row instead ──────────────────────────
  if (tier === "org") {
    const [orgRow] = await db
      .select()
      .from(storageUsageTable)
      .where(eq(storageUsageTable.orgId, orgId));

    if (orgRow) {
      return {
        tier: "org",
        keyPrefix: orgId,
        usedBytes: orgRow.usedBytes,
        quotaBytes: orgRow.quotaBytes,
      };
    }

    // No org row yet — create one (the org owner's userId as PK)
    const [inserted] = await db
      .insert(storageUsageTable)
      .values({
        userId,
        orgId,
        tier: "org",
        usedBytes: 0,
        quotaBytes: QUOTA_BYTES.org,
      })
      .onConflictDoNothing()
      .returning();

    return {
      tier: "org",
      keyPrefix: orgId,
      usedBytes: inserted?.usedBytes ?? 0,
      quotaBytes: inserted?.quotaBytes ?? QUOTA_BYTES.org,
    };
  }

  // ── 3. Free / premium: use (or create) the user's own row ───────────────
  if (userRow) {
    return {
      tier,
      keyPrefix: userId,
      usedBytes: userRow.usedBytes,
      quotaBytes: userRow.quotaBytes,
    };
  }

  const [inserted] = await db
    .insert(storageUsageTable)
    .values({
      userId,
      orgId: null,
      tier: "free",
      usedBytes: 0,
      quotaBytes: QUOTA_BYTES.free,
    })
    .onConflictDoNothing()
    .returning();

  return {
    tier: "free",
    keyPrefix: userId,
    usedBytes: inserted?.usedBytes ?? 0,
    quotaBytes: inserted?.quotaBytes ?? QUOTA_BYTES.free,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Build the S3 object key.
 * Format: {keyPrefix}/{folder}/{timestamp}-{sanitised filename}
 */
export function buildKey(
  keyPrefix: string,
  folder: StorageFolder,
  filename: string,
): string {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${keyPrefix}/${folder}/${Date.now()}-${safe}`;
}

/**
 * Returns a pre-signed PUT URL (15 min expiry) for direct browser → S3 uploads.
 */
export async function getPresignedUploadUrl(
  userId: string,
  orgId: string,
  filename: string,
  contentType: string,
  folder: StorageFolder,
): Promise<{ uploadUrl: string; fileKey: string; expiresIn: number }> {
  const { keyPrefix } = await resolveStorageContext(userId, orgId);
  const fileKey = buildKey(keyPrefix, folder, filename);
  const cmd = new PutObjectCommand({
    Bucket: BUCKET,
    Key: fileKey,
    ContentType: contentType,
  });
  const uploadUrl = await getSignedUrl(getS3Client(), cmd, { expiresIn: 900 });
  return { uploadUrl, fileKey, expiresIn: 900 };
}

/**
 * Uploads a Buffer directly to S3 (server-side). Returns the fileKey.
 */
export async function uploadBuffer(
  userId: string,
  orgId: string,
  folder: StorageFolder,
  filename: string,
  buffer: Buffer,
  contentType: string,
): Promise<string> {
  const { keyPrefix } = await resolveStorageContext(userId, orgId);
  const fileKey = buildKey(keyPrefix, folder, filename);
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: fileKey,
      Body: buffer,
      ContentType: contentType,
    }),
  );
  return fileKey;
}

/**
 * Returns a pre-signed GET URL (1 hour expiry).
 */
export async function getPresignedDownloadUrl(
  userId: string,
  orgId: string,
  key: string,
): Promise<{ downloadUrl: string; expiresIn: number }> {
  await assertKeyOwnership(userId, orgId, key);
  const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  const downloadUrl = await getSignedUrl(getS3Client(), cmd, {
    expiresIn: 3600,
  });
  return { downloadUrl, expiresIn: 3600 };
}

/**
 * Permanently deletes an object from S3.
 */
export async function deleteFile(
  userId: string,
  orgId: string,
  key: string,
): Promise<void> {
  await assertKeyOwnership(userId, orgId, key);
  await getS3Client().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

/**
 * Returns current usage for the user's effective quota row.
 */
export async function getStorageUsage(
  userId: string,
  orgId: string,
): Promise<{ usedBytes: number; quotaBytes: number; tier: StorageTier }> {
  const { usedBytes, quotaBytes, tier } = await resolveStorageContext(userId, orgId);
  return { usedBytes, quotaBytes, tier };
}

/**
 * Throws a 413-style error if adding `fileSize` bytes would exceed quota.
 */
export async function checkQuota(
  userId: string,
  orgId: string,
  fileSize: number,
): Promise<void> {
  const { usedBytes, quotaBytes } = await resolveStorageContext(userId, orgId);
  if (usedBytes + fileSize > quotaBytes) {
    const err = new Error(
      `Storage quota exceeded. Used ${(usedBytes / 1_048_576).toFixed(1)} MB of ${(quotaBytes / 1_048_576).toFixed(0)} MB.`,
    );
    (err as Error & { statusCode: number }).statusCode = 413;
    throw err;
  }
}

/**
 * Increments (+) or decrements (−) used_bytes on the correct row.
 * For org-tier: updates the shared org row (matched by orgId unique index).
 * For free/premium: updates the user's own row.
 */
export async function updateStorageUsage(
  userId: string,
  orgId: string,
  delta: number,
): Promise<void> {
  const { tier } = await resolveStorageContext(userId, orgId);

  if (tier === "org") {
    // Update the shared org row — find it by org_id
    await db
      .update(storageUsageTable)
      .set({
        usedBytes: sql`GREATEST(0, ${storageUsageTable.usedBytes} + ${delta})`,
        updatedAt: sql`now()`,
      })
      .where(eq(storageUsageTable.orgId, orgId));
  } else {
    await db
      .update(storageUsageTable)
      .set({
        usedBytes: sql`GREATEST(0, ${storageUsageTable.usedBytes} + ${delta})`,
        updatedAt: sql`now()`,
      })
      .where(eq(storageUsageTable.userId, userId));
  }
}

/**
 * Returns the size in bytes of an S3 object via HeadObject.
 * Throws 403 if the key doesn't belong to this user/org.
 * Returns 0 if the object is not found (already deleted).
 */
export async function getFileSize(
  userId: string,
  orgId: string,
  key: string,
): Promise<number> {
  await assertKeyOwnership(userId, orgId, key);
  try {
    const result = await getS3Client().send(
      new HeadObjectCommand({ Bucket: BUCKET, Key: key }),
    );
    return result.ContentLength ?? 0;
  } catch (err: unknown) {
    const e = err as { name?: string };
    if (e.name === "NotFound" || e.name === "NoSuchKey") return 0;
    throw err;
  }
}

// ── Internal trusted helpers (caller has already verified ownership via DB) ───

/**
 * Downloads an S3 object to a Buffer.
 * No ownership check — callers must verify access at the DB level first.
 */
export async function downloadToBuffer(key: string): Promise<Buffer> {
  const result = await getS3Client().send(
    new GetObjectCommand({ Bucket: BUCKET, Key: key }),
  );
  if (!result.Body) throw new Error(`S3 object has no body: ${key}`);
  const bytes = await (result.Body as { transformToByteArray(): Promise<Uint8Array> }).transformToByteArray();
  return Buffer.from(bytes);
}

/**
 * Returns a presigned GET URL without an ownership check.
 * No ownership check — callers must verify access at the DB level first.
 */
export async function getPresignedDownloadUrlForKey(
  key: string,
): Promise<{ downloadUrl: string; expiresIn: number }> {
  const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  const downloadUrl = await getSignedUrl(getS3Client(), cmd, { expiresIn: 3600 });
  return { downloadUrl, expiresIn: 3600 };
}

/**
 * Deletes an S3 object by key.
 * No ownership check — callers must verify access at the DB level first.
 */
export async function deleteFileByKey(key: string): Promise<void> {
  await getS3Client().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Ensures the requested key belongs to this user or their org.
 * Throws 403 if neither prefix matches.
 */
async function assertKeyOwnership(
  userId: string,
  orgId: string,
  key: string,
): Promise<void> {
  if (key.startsWith(`${userId}/`) || key.startsWith(`${orgId}/`)) return;

  const err = new Error("Access denied: file does not belong to this account");
  (err as Error & { statusCode: number }).statusCode = 403;
  throw err;
}
