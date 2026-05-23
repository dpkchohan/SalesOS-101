import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { eq, sql } from "drizzle-orm";
import { db, storageUsageTable } from "@workspace/db";

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
  | "feedback";

/**
 * Build the S3 object key for a given org + folder + filename.
 * Format: {orgId}/{folder}/{timestamp}-{sanitised filename}
 */
export function buildKey(
  orgId: string,
  folder: StorageFolder,
  filename: string,
): string {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${orgId}/${folder}/${Date.now()}-${safe}`;
}

/**
 * Returns a pre-signed PUT URL (15 min expiry) for direct browser → S3 uploads.
 */
export async function getPresignedUploadUrl(
  orgId: string,
  filename: string,
  contentType: string,
  folder: StorageFolder,
): Promise<{ uploadUrl: string; fileKey: string; expiresIn: number }> {
  const fileKey = buildKey(orgId, folder, filename);
  const cmd = new PutObjectCommand({
    Bucket: BUCKET,
    Key: fileKey,
    ContentType: contentType,
  });
  const uploadUrl = await getSignedUrl(getS3Client(), cmd, { expiresIn: 900 });
  return { uploadUrl, fileKey, expiresIn: 900 };
}

/**
 * Returns a pre-signed GET URL (1 hour expiry).
 */
export async function getPresignedDownloadUrl(
  orgId: string,
  key: string,
): Promise<{ downloadUrl: string; expiresIn: number }> {
  assertKeyOwnership(orgId, key);
  const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  const downloadUrl = await getSignedUrl(getS3Client(), cmd, {
    expiresIn: 3600,
  });
  return { downloadUrl, expiresIn: 3600 };
}

/**
 * Permanently deletes an object from S3.
 */
export async function deleteFile(orgId: string, key: string): Promise<void> {
  assertKeyOwnership(orgId, key);
  await getS3Client().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

/**
 * Returns current usage row, inserting a zero row if none exists yet.
 */
export async function getStorageUsage(
  orgId: string,
): Promise<{ usedBytes: number; quotaBytes: number }> {
  const [row] = await db
    .select()
    .from(storageUsageTable)
    .where(eq(storageUsageTable.orgId, orgId));

  if (row) return { usedBytes: row.usedBytes, quotaBytes: row.quotaBytes };

  // First time — insert zero row with default quota
  const [inserted] = await db
    .insert(storageUsageTable)
    .values({ orgId })
    .onConflictDoNothing()
    .returning();

  return {
    usedBytes: inserted?.usedBytes ?? 0,
    quotaBytes: inserted?.quotaBytes ?? 262144000,
  };
}

/**
 * Throws a 413-style error if adding `fileSize` bytes would exceed quota.
 */
export async function checkQuota(
  orgId: string,
  fileSize: number,
): Promise<void> {
  const { usedBytes, quotaBytes } = await getStorageUsage(orgId);
  if (usedBytes + fileSize > quotaBytes) {
    const err = new Error(
      `Storage quota exceeded. Used ${(usedBytes / 1048576).toFixed(1)} MB of ${(quotaBytes / 1048576).toFixed(0)} MB.`,
    );
    (err as Error & { statusCode: number }).statusCode = 413;
    throw err;
  }
}

/**
 * Increments (+) or decrements (−) used_bytes for the org.
 */
export async function updateStorageUsage(
  orgId: string,
  delta: number,
): Promise<void> {
  await db
    .insert(storageUsageTable)
    .values({ orgId, usedBytes: Math.max(0, delta) })
    .onConflictDoUpdate({
      target: storageUsageTable.orgId,
      set: {
        usedBytes: sql`GREATEST(0, ${storageUsageTable.usedBytes} + ${delta})`,
        updatedAt: sql`now()`,
      },
    });
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function assertKeyOwnership(orgId: string, key: string): void {
  if (!key.startsWith(`${orgId}/`)) {
    const err = new Error("Access denied: file does not belong to this org");
    (err as Error & { statusCode: number }).statusCode = 403;
    throw err;
  }
}
