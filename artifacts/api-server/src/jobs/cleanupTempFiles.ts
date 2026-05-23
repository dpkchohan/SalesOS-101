import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectCommand,
  type _Object,
} from "@aws-sdk/client-s3";
import { eq, or, sql } from "drizzle-orm";
import { db, storageUsageTable } from "@workspace/db";
import { logger } from "../lib/logger";

const BUCKET = process.env.AWS_S3_BUCKET ?? "salesos-production-storage";
const REGION = process.env.AWS_REGION ?? "ap-south-1";
const TEMP_PREFIX = "temp/";
const STALE_MS = 30 * 60 * 1000; // 30 minutes

function makeS3Client(): S3Client {
  return new S3Client({
    region: REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  });
}

/**
 * Decrements used_bytes for whichever storage_usage row owns this key prefix.
 * The prefix is the first path segment of the S3 key — it matches either
 * user_id (free/premium) or org_id (org-tier).
 */
async function decrementStorageByPrefix(
  keyPrefix: string,
  bytes: number,
): Promise<void> {
  await db
    .update(storageUsageTable)
    .set({
      usedBytes: sql`GREATEST(0, ${storageUsageTable.usedBytes} - ${bytes})`,
      updatedAt: sql`now()`,
    })
    .where(
      or(
        eq(storageUsageTable.userId, keyPrefix),
        eq(storageUsageTable.orgId, keyPrefix),
      ),
    );
}

/**
 * Lists all pages of objects under every /{owner}/temp/ sub-prefix.
 * S3 doesn't let us query `*\/temp\/` directly, so we list the bucket
 * root at depth-1 to get owner prefixes, then list each owner's temp/.
 *
 * Returned objects include Size and LastModified.
 */
async function listAllTempObjects(s3: S3Client): Promise<_Object[]> {
  const objects: _Object[] = [];

  // ── Step 1: get all top-level "owner/" prefixes ───────────────────────────
  const ownerPrefixes: string[] = [];
  let ownerToken: string | undefined;
  do {
    const resp = await s3.send(
      new ListObjectsV2Command({
        Bucket: BUCKET,
        Delimiter: "/",
        ContinuationToken: ownerToken,
      }),
    );
    for (const cp of resp.CommonPrefixes ?? []) {
      if (cp.Prefix) ownerPrefixes.push(cp.Prefix);
    }
    ownerToken = resp.NextContinuationToken;
  } while (ownerToken);

  // ── Step 2: for each owner, list their temp/ objects ─────────────────────
  for (const ownerPrefix of ownerPrefixes) {
    const tempPrefix = `${ownerPrefix}${TEMP_PREFIX}`;
    let token: string | undefined;
    do {
      const resp = await s3.send(
        new ListObjectsV2Command({
          Bucket: BUCKET,
          Prefix: tempPrefix,
          ContinuationToken: token,
        }),
      );
      objects.push(...(resp.Contents ?? []));
      token = resp.NextContinuationToken;
    } while (token);
  }

  return objects;
}

/**
 * Main job: delete temp files older than 30 minutes and decrement quotas.
 * Safe to run repeatedly — individual failures are logged but don't abort
 * the rest of the batch. If the whole job throws, the caller logs + retries
 * next cycle.
 *
 * No-ops silently when AWS credentials are not configured (dev environment).
 */
export async function cleanupTempFiles(): Promise<void> {
  // Skip gracefully when AWS is not configured (e.g. local dev / Replit).
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    return;
  }

  const jobLog = logger.child({ job: "cleanupTempFiles" });
  jobLog.info("Starting temp file cleanup");

  const s3 = makeS3Client();
  const cutoff = new Date(Date.now() - STALE_MS);
  let listed = 0;
  let deleted = 0;
  let errors = 0;

  let objects: _Object[];
  try {
    objects = await listAllTempObjects(s3);
  } catch (err) {
    jobLog.error({ err }, "Failed to list temp objects — aborting cycle");
    throw err; // let caller schedule retry
  }

  listed = objects.length;

  for (const obj of objects) {
    const key = obj.Key;
    const lastModified = obj.LastModified;
    const size = obj.Size ?? 0;

    if (!key || !lastModified) continue;
    if (lastModified >= cutoff) continue; // not stale yet

    // Key format: {ownerPrefix}/{tempFolder}/{timestamp}-{name}
    // ownerPrefix is the first path segment (userId or orgId)
    const keyPrefix = key.split("/")[0];
    if (!keyPrefix) continue;

    // ── Delete from S3 ───────────────────────────────────────────────────────
    try {
      await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
      jobLog.info({ key, ageMs: Date.now() - lastModified.getTime() }, "Deleted stale temp file");
    } catch (err) {
      jobLog.error({ err, key }, "Failed to delete stale temp file — skipping");
      errors++;
      continue;
    }

    // ── Decrement quota ──────────────────────────────────────────────────────
    if (size > 0) {
      try {
        await decrementStorageByPrefix(keyPrefix, size);
      } catch (err) {
        jobLog.error({ err, key, keyPrefix, size }, "Failed to decrement storage usage after delete");
        errors++;
        // Don't re-add the file — the delete already happened. Just log.
      }
    }

    deleted++;
  }

  jobLog.info(
    { listed, deleted, errors },
    `Temp file cleanup complete — ${deleted} deleted, ${errors} errors`,
  );
}
