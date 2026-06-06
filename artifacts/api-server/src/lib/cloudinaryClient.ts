import { v2 as cloudinary } from "cloudinary";

let configured = false;

export function getCloudinary() {
  if (!configured) {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;

    if (!cloudName || !apiKey || !apiSecret) {
      throw new Error(
        "Cloudinary not configured — set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET",
      );
    }

    cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });
    configured = true;
  }
  return cloudinary;
}

export function isCloudinaryConfigured(): boolean {
  return !!(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  );
}

/**
 * Upload a buffer to Cloudinary as a private authenticated image.
 * Returns the public_id — store this in the DB.
 */
export async function uploadFeedbackScreenshot(
  buffer: Buffer,
  mimeType: string,
): Promise<string> {
  const cld = getCloudinary();

  // Determine resource format from MIME type
  const ext = mimeType.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";

  return new Promise((resolve, reject) => {
    const stream = cld.uploader.upload_stream(
      {
        folder: "feedback-screenshots",
        resource_type: "image",
        // "authenticated" type — image is private; only accessible via signed URL
        type: "authenticated",
        // Tag for batch operations
        tags: ["feedback"],
        format: ext,
        // Compress to keep storage lean
        quality: "auto:eco",
        // Max 1600px wide — screenshots don't need to be larger
        transformation: [{ width: 1600, crop: "limit" }],
      },
      (err, result) => {
        if (err || !result) return reject(err ?? new Error("Cloudinary upload returned no result"));
        resolve(result.public_id);
      },
    );
    stream.end(buffer);
  });
}

/**
 * Generate a time-limited signed URL for an authenticated Cloudinary image.
 * Default expiry: 1 hour.
 */
export function generateSignedUrl(publicId: string, expiresInSeconds = 3600): string {
  const cld = getCloudinary();
  const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds;
  return cld.url(publicId, {
    type: "authenticated",
    sign_url: true,
    expires_at: expiresAt,
    secure: true,
  });
}

/**
 * Permanently delete an image from Cloudinary.
 * Call this when the feedback entry is deleted.
 */
export async function deleteFeedbackScreenshot(publicId: string): Promise<void> {
  const cld = getCloudinary();
  await cld.uploader.destroy(publicId, { type: "authenticated", invalidate: true });
}

/**
 * Delete all feedback screenshots older than `days` days.
 * Returns the number of assets deleted.
 * Call this periodically (e.g. from an admin endpoint) for cleanup.
 */
export async function deleteOldScreenshots(days: number): Promise<number> {
  const cld = getCloudinary();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  // Search for authenticated images in the feedback-screenshots folder
  const result = await cld.search
    .expression(`folder:feedback-screenshots AND resource_type:image AND uploaded_at<${cutoff.toISOString()}`)
    .max_results(100)
    .execute() as { resources: { public_id: string }[] };

  if (!result.resources?.length) return 0;

  await Promise.allSettled(
    result.resources.map((r) =>
      cld.uploader.destroy(r.public_id, { type: "authenticated", invalidate: true }),
    ),
  );

  return result.resources.length;
}

/** Encode a Cloudinary public_id for DB storage */
export function encodePublicId(publicId: string): string {
  return `cld:${publicId}`;
}

/** Decode a DB value back to Cloudinary public_id. Returns null if not a Cloudinary ref. */
export function decodePublicId(value: string): string | null {
  return value.startsWith("cld:") ? value.slice(4) : null;
}
