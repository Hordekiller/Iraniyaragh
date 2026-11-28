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
  PutBucketCorsCommand,
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
        // Original uploads remain private until verified and re-encoded by the
        // worker. Only its immutable public rendition namespace is readable.
        Resource: [`arn:aws:s3:::${bucket}/renditions/products/*`],
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

async function allowBrowserUploads() {
  const origins = [...new Set((process.env.CORS_ORIGINS ?? '')
    .split(',').map(value => value.trim()).filter(Boolean))];
  if (!origins.length || origins.some(value => {
    try {
      const url = new URL(value);
      return !['http:', 'https:'].includes(url.protocol) || url.origin !== value || !!url.username || !!url.password;
    } catch { return true; }
  })) throw new Error('CORS_ORIGINS must contain explicit HTTP(S) origins for browser media uploads.');
  try {
    await client.send(new PutBucketCorsCommand({ Bucket: bucket, CORSConfiguration: {
      CORSRules: [{ AllowedOrigins: origins, AllowedMethods: ['PUT'], AllowedHeaders: ['*'], ExposeHeaders: ['ETag'], MaxAgeSeconds: 300 }],
    } }));
  } catch (error) {
    const unsupported = error instanceof Error && (error.name === 'NotImplemented' || error.$metadata?.httpStatusCode === 501);
    if (!unsupported || process.env.OBJECT_STORAGE_CORS_FALLBACK !== 'minio-global') throw error;
    // The pinned community MinIO used by CI lacks PutBucketCors. It starts
    // with MINIO_API_CORS_ALLOW_ORIGIN scoped to the same explicit origins.
    // Verify the actual browser preflight instead of treating a 501 as success.
    const probe = new URL(`${bucket}/quarantine/cors-probe`, endpoint.endsWith('/') ? endpoint : `${endpoint}/`);
    for (const origin of origins) {
      const response = await fetch(probe, { method: 'OPTIONS', headers: {
        Origin: origin, 'Access-Control-Request-Method': 'PUT', 'Access-Control-Request-Headers': 'content-type',
      } });
      const allowedMethods = (response.headers.get('access-control-allow-methods') ?? '').split(/\s*,\s*/u);
      if (!response.ok || response.headers.get('access-control-allow-origin') !== origin || !allowedMethods.includes('PUT')) {
        throw new Error(`Object storage did not approve the browser PUT preflight for ${origin}.`);
      }
    }
    console.log('Provider-managed browser CORS preflight verified for configured origins.');
  }
}

try {
  const state = await ensureBucket();
  await allowPublicRead();
  await allowBrowserUploads();
  console.log(
    `Object-storage bucket "${bucket}" ${state}; rendition-only public read and origin-scoped browser uploads configured.`,
  );
} catch (error) {
  console.error(
    `Failed to provision object-storage bucket "${bucket}": ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}
