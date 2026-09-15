import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { ConfigService } from '@nestjs/config';
import type { EnvironmentVariables } from '../../config/environment';
import type { PresignedPut, ProductMediaStorage, StoredObjectHead } from './storage.port';

export class S3ProductMediaStorage implements ProductMediaStorage {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    this.bucket = config.get('OBJECT_STORAGE_BUCKET', { infer: true });
    this.client = new S3Client({
      endpoint: config.get('OBJECT_STORAGE_ENDPOINT', { infer: true }),
      region: config.get('OBJECT_STORAGE_REGION', { infer: true }),
      forcePathStyle: config.get('OBJECT_STORAGE_FORCE_PATH_STYLE', { infer: true }),
      credentials: {
        accessKeyId: config.get('OBJECT_STORAGE_ACCESS_KEY', { infer: true }),
        secretAccessKey: config.get('OBJECT_STORAGE_SECRET_KEY', { infer: true }),
      },
    });
  }

  async presignPut(input: {
    objectKey: string;
    contentType: string;
    bytes: number;
    expiresInSeconds: number;
  }): Promise<PresignedPut> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: input.objectKey,
      ContentType: input.contentType,
      ContentLength: input.bytes,
    });
    const url = await getSignedUrl(this.client, command, { expiresIn: input.expiresInSeconds });
    return {
      url,
      requiredHeaders: {
        'content-type': input.contentType,
      },
      expiresAt: new Date(Date.now() + input.expiresInSeconds * 1000),
    };
  }

  async headObject(objectKey: string): Promise<StoredObjectHead | null> {
    try {
      const head = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: objectKey }));
      return {
        objectKey,
        bytes: head.ContentLength ?? 0,
        contentType: head.ContentType ?? null,
        checksumSha256: head.ChecksumSHA256
          ? Buffer.from(head.ChecksumSHA256, 'base64').toString('hex')
          : null,
      };
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (status === 404) return null;
      throw error;
    }
  }

  async getObject(objectKey: string): Promise<NodeJS.ReadableStream> {
    const response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: objectKey }));
    if (!response.Body || typeof (response.Body as NodeJS.ReadableStream).pipe !== 'function') {
      throw new Error('Object storage returned a non-streaming body.');
    }
    return response.Body as NodeJS.ReadableStream;
  }

  async putObject(input: { objectKey: string; body: Buffer; contentType: string; checksumSha256: string }): Promise<void> {
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: input.objectKey,
      Body: input.body,
      ContentLength: input.body.byteLength,
      ContentType: input.contentType,
      ChecksumSHA256: Buffer.from(input.checksumSha256, 'hex').toString('base64'),
      CacheControl: 'public, max-age=31536000, immutable',
    }));
  }

  async deleteObject(objectKey: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: objectKey }));
  }
}
