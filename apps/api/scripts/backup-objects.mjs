#!/usr/bin/env node
/**
 * Backs up every object in the product-media bucket to a plain directory.
 *
 * The object store is S3-compatible but has no usable native replication
 * tooling in the image we deploy, and no S3 CLI is available on the host, so
 * backup goes through the same AWS SDK the application already uses. That keeps
 * it provider-neutral and adds no dependency.
 *
 * The layout is intentionally boring so a restore needs nothing but this script
 * and a filesystem copy:
 *
 *   <dir>/manifest.json     bucket, policy, and a checksummed object listing
 *   <dir>/objects/<key>     one file per object, keys as real paths
 *
 * Run it from the API image, which is the only image that has the SDK:
 *   docker compose run --rm -v "$PWD/backups:/backup" api \
 *     node scripts/backup-objects.mjs
 */
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import {
  GetBucketPolicyCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";

const endpoint = process.env.OBJECT_STORAGE_ENDPOINT ?? "http://localhost:9000";
const region = process.env.OBJECT_STORAGE_REGION ?? "us-east-1";
const forcePathStyle =
  (process.env.OBJECT_STORAGE_FORCE_PATH_STYLE ?? "true") !== "false";
const bucket = process.env.OBJECT_STORAGE_BUCKET ?? "products";
const accessKeyId = process.env.OBJECT_STORAGE_ACCESS_KEY;
const secretAccessKey = process.env.OBJECT_STORAGE_SECRET_KEY;
const outDir = process.env.OBJECT_BACKUP_DIR ?? "/backup";

if (!accessKeyId || !secretAccessKey) {
  console.error("OBJECT_STORAGE_ACCESS_KEY and OBJECT_STORAGE_SECRET_KEY are required.");
  process.exit(1);
}

const client = new S3Client({
  endpoint,
  region,
  forcePathStyle,
  credentials: { accessKeyId, secretAccessKey },
});

async function listAllKeys() {
  const keys = [];
  let continuationToken;
  do {
    const page = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: continuationToken }),
    );
    for (const item of page.Contents ?? []) {
      if (item.Key) keys.push({ key: item.Key, bytes: item.Size ?? 0 });
    }
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);
  return keys;
}

async function readPolicy() {
  try {
    const response = await client.send(new GetBucketPolicyCommand({ Bucket: bucket }));
    return response.Policy ?? null;
  } catch {
    // A missing policy is a legitimate state to record, not a backup failure.
    return null;
  }
}

async function main() {
  const startedAt = new Date().toISOString();
  const policy = await readPolicy();
  const objects = await listAllKeys();
  const objectsDir = join(outDir, "objects");
  await mkdir(objectsDir, { recursive: true });

  const listing = [];
  for (const entry of objects) {
    const target = join(objectsDir, entry.key);
    await mkdir(dirname(target), { recursive: true });
    const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: entry.key }));

    // Record the metadata that the object was published with, not just its
    // bytes. This is what makes the store a *product media* store: `ContentType`
    // is what a browser uses to decide whether the rendition is an image, and
    // `CacheControl` is what keeps a published image cacheable. Restoring bytes
    // without them would produce a bucket where every object downloads as
    // application/octet-stream, which is a silently broken storefront rather
    // than a visible failure.
    const metadata = {
      contentType: response.ContentType ?? null,
      contentDisposition: response.ContentDisposition ?? null,
      cacheControl: response.CacheControl ?? null,
      contentEncoding: response.ContentEncoding ?? null,
      contentLanguage: response.ContentLanguage ?? null,
      // Object metadata is the only place custom headers such as the published
      // size survive, so carry it through verbatim.
      userMetadata: response.Metadata ?? {},
    };

    await pipeline(response.Body, createWriteStream(target));

    // Re-read what landed on disk so the manifest attests to the actual bytes
    // that were written, not to what the store claimed to send.
    const digest = createHash("sha256");
    digest.update(await readFile(target));
    listing.push({
      key: entry.key,
      bytes: entry.bytes,
      sha256: digest.digest("hex"),
      ...metadata,
    });
  }

  await writeFile(
    join(outDir, "manifest.json"),
    `${JSON.stringify(
      // v2 adds the per-object metadata (content type, cache control, custom
      // metadata) needed to restore a storefront that actually renders its
      // media. A v1 manifest is still restorable: restore treats every metadata
      // field as optional.
      { version: 2, bucket, region, endpoint, startedAt, policy, objects: listing },
      null,
      2,
    )}\n`,
  );

  const totalBytes = listing.reduce((sum, entry) => sum + entry.bytes, 0);
  console.log(
    `Backed up ${listing.length} object(s) (${totalBytes} bytes) and ${policy ? "the bucket policy" : "no bucket policy"} for "${bucket}" to ${outDir}.`,
  );
}

main().catch((error) => {
  console.error(`Object backup failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
