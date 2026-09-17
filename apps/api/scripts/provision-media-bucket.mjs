#!/usr/bin/env node
/**
 * Provisions the S3-compatible object-storage bucket used by product media.
 *
 * Creates the bucket when missing and applies a read-only public policy so the
 * storefront origin (PUBLIC_MEDIA_ORIGIN) can serve the processed renditions
 * without credentials. Safe to run repeatedly.
 */
import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketPolicyCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const endpoint = process.env.OBJECT_STORAGE_ENDPOINT ?? "http://localhost:9000";
const region = process.env.OBJECT_STORAGE_REGION ?? "us-east-1";
const forcePathStyle =
  (process.env.OBJECT_STORAGE_FORCE_PATH_STYLE ?? "true") !== "false";
const bucket = process.env.OBJECT_STORAGE_BUCKET ?? "products";
const accessKeyId = process.env.OBJECT_STORAGE_ACCESS_KEY;
const secretAccessKey = process.env.OBJECT_STORAGE_SECRET_KEY;

if (!accessKeyId || !secretAccessKey) {
  console.error(
    "OBJECT_STORAGE_ACCESS_KEY and OBJECT_STORAGE_SECRET_KEY are required.",
  );
  process.exit(1);
}

const client = new S3Client({
  endpoint,
  region,
  forcePathStyle,
  credentials: { accessKeyId, secretAccessKey },
});

async function ensureBucket() {
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    return "exists";
  } catch {
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
    return "created";
  }
}

async function allowPublicRead() {
  const policy = {
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: { AWS: ["*"] },
        Action: ["s3:GetObject"],
        Resource: [`arn:aws:s3:::${bucket}/*`],
      },
    ],
  };
  await client.send(
    new PutBucketPolicyCommand({
      Bucket: bucket,
      Policy: JSON.stringify(policy),
    }),
  );
}

try {
  const state = await ensureBucket();
  await allowPublicRead();
  console.log(
    `Object-storage bucket "${bucket}" ${state}; public read policy applied.`,
  );
} catch (error) {
  console.error(
    `Failed to provision object-storage bucket "${bucket}": ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}
