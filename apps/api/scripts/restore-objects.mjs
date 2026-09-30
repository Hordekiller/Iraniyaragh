#!/usr/bin/env node
/**
 * Restores a directory produced by backup-objects.mjs into the product-media
 * bucket, recreating the bucket and its public-read policy if they are missing.
 *
 * Intended for recovering into an empty store after data loss. It overwrites
 * objects that already exist, so point it at a backup deliberately:
 *   docker compose run --rm -v "$PWD/backups/<stamp>:/backup" api \
 *     node scripts/restore-objects.mjs
 */
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  CreateBucketCommand,
  GetBucketPolicyCommand,
  HeadBucketCommand,
  PutBucketPolicyCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const endpoint = process.env.OBJECT_STORAGE_ENDPOINT ?? "http://localhost:9000";
const region = process.env.OBJECT_STORAGE_REGION ?? "us-east-1";
const forcePathStyle =
  (process.env.OBJECT_STORAGE_FORCE_PATH_STYLE ?? "true") !== "false";
const accessKeyId = process.env.OBJECT_STORAGE_ACCESS_KEY;
const secretAccessKey = process.env.OBJECT_STORAGE_SECRET_KEY;
const backupDir = process.env.OBJECT_BACKUP_DIR ?? "/backup";

if (!accessKeyId || !secretAccessKey) {
  console.error("OBJECT_STORAGE_ACCESS_KEY and OBJECT_STORAGE_SECRET_KEY are required.");
  process.exit(1);
}

const manifestPath = join(backupDir, "manifest.json");

async function main() {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch (error) {
    console.error(
      `Cannot read ${manifestPath}. Point OBJECT_BACKUP_DIR at a backup directory: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    process.exit(1);
  }

  // The manifest is the source of truth for which bucket and endpoint to use, so
  // a restore cannot silently write into a different bucket than was backed up.
  const bucket = manifest.bucket;
  if (typeof bucket !== "string" || bucket.length === 0) {
    console.error("Backup manifest has no bucket; refusing to guess one.");
    process.exit(1);
  }

  const client = new S3Client({
    endpoint,
    region,
    forcePathStyle,
    credentials: { accessKeyId, secretAccessKey },
  });

  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch {
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
    console.log(`Created bucket "${bucket}".`);
  }

  let restored = 0;
  for (const entry of manifest.objects ?? []) {
    const source = join(backupDir, "objects", entry.key);
    const body = await readFile(source);
    if (entry.sha256) {
      const digest = createHash("sha256").update(body).digest("hex");
      if (digest !== entry.sha256) {
        console.error(`Checksum mismatch for ${entry.key}; refusing to restore a corrupt object.`);
        process.exit(1);
      }
    }
    // Re-apply the recorded metadata, not just the bytes. A restored object
    // without its ContentType would still download, but as
    // application/octet-stream, so a product image would stop rendering in the
    // storefront. Metadata is optional in a manifest (an older backup may not
    // carry it), so each field is only sent when present.
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: entry.key,
        Body: createReadStream(source),
        ContentLength: entry.bytes,
        ...(entry.contentType ? { ContentType: entry.contentType } : {}),
        ...(entry.contentDisposition ? { ContentDisposition: entry.contentDisposition } : {}),
        ...(entry.cacheControl ? { CacheControl: entry.cacheControl } : {}),
        ...(entry.contentEncoding ? { ContentEncoding: entry.contentEncoding } : {}),
        ...(entry.contentLanguage ? { ContentLanguage: entry.contentLanguage } : {}),
        ...(entry.userMetadata && Object.keys(entry.userMetadata).length > 0
          ? { Metadata: entry.userMetadata }
          : {}),
      }),
    );
    restored += 1;
  }

  // The bucket is useless to the storefront without public read, and the policy
  // lives only in the backup, so reapply it whenever we have one.
  if (typeof manifest.policy === "string" && manifest.policy.length > 0) {
    await client.send(new PutBucketPolicyCommand({ Bucket: bucket, Policy: manifest.policy }));
    console.log("Reapplied the bucket policy.");
  } else {
    const current = await client.send(new GetBucketPolicyCommand({ Bucket: bucket })).catch(() => null);
    if (!current?.Policy) {
      console.error("Backup has no policy and the bucket has none either; published media will 403.");
      process.exit(1);
    }
  }

  console.log(`Restored ${restored} object(s) into "${bucket}".`);
}

main().catch((error) => {
  console.error(`Object restore failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
