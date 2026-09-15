import { ConfigService } from '@nestjs/config';
import { S3Client } from '@aws-sdk/client-s3';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EnvironmentVariables } from '../../config/environment';
import { S3ProductMediaStorage } from './s3-storage.adapter';

const signedUrl = vi.hoisted(() => vi.fn());
vi.mock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: signedUrl }));

function adapter() {
  const config = new ConfigService<EnvironmentVariables, true>({
    OBJECT_STORAGE_BUCKET: 'private-products',
    OBJECT_STORAGE_ENDPOINT: 'http://127.0.0.1:9000',
    OBJECT_STORAGE_REGION: 'us-east-1',
    OBJECT_STORAGE_FORCE_PATH_STYLE: true,
    OBJECT_STORAGE_ACCESS_KEY: 'test-access',
    OBJECT_STORAGE_SECRET_KEY: 'test-secret',
  } as EnvironmentVariables);
  return new S3ProductMediaStorage(config);
}

describe('S3ProductMediaStorage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    signedUrl.mockReset();
  });

  it('presigns one exact private PUT with bounded headers', async () => {
    signedUrl.mockResolvedValue('http://storage.test/private-signed-url');
    vi.useFakeTimers({ now: new Date('2026-09-15T06:00:00Z') });

    const result = await adapter().presignPut({
      objectKey: 'quarantine/products/p1/m1/n.jpg',
      contentType: 'image/jpeg',
      bytes: 1234,
      expiresInSeconds: 600,
    });

    expect(signedUrl).toHaveBeenCalledWith(
      expect.any(S3Client),
      expect.objectContaining({ input: expect.objectContaining({ Bucket: 'private-products', Key: 'quarantine/products/p1/m1/n.jpg', ContentLength: 1234 }) }),
      { expiresIn: 600 },
    );
    expect(result.requiredHeaders).toEqual({ 'content-type': 'image/jpeg' });
    expect(result.expiresAt.toISOString()).toBe('2026-09-15T06:10:00.000Z');
  });

  it('maps trusted HEAD metadata and converts the checksum to lowercase hex', async () => {
    vi.spyOn(S3Client.prototype, 'send').mockResolvedValueOnce({
      ContentLength: 1234,
      ContentType: 'image/png',
      ChecksumSHA256: Buffer.from('ab'.repeat(32), 'hex').toString('base64'),
    } as never);

    await expect(adapter().headObject('quarantine/source.png')).resolves.toEqual({
      objectKey: 'quarantine/source.png',
      bytes: 1234,
      contentType: 'image/png',
      checksumSha256: 'ab'.repeat(32),
    });
  });

  it('maps only a storage 404 to a missing object', async () => {
    vi.spyOn(S3Client.prototype, 'send').mockRejectedValueOnce({ $metadata: { httpStatusCode: 404 } });
    await expect(adapter().headObject('missing')).resolves.toBeNull();

    vi.spyOn(S3Client.prototype, 'send').mockRejectedValueOnce({ $metadata: { httpStatusCode: 503 } });
    await expect(adapter().headObject('unavailable')).rejects.toMatchObject({
      $metadata: { httpStatusCode: 503 },
    });
  });

  it('never accepts a buffered/non-streaming download body', async () => {
    vi.spyOn(S3Client.prototype, 'send').mockResolvedValueOnce({ Body: new Uint8Array([1, 2, 3]) } as never);
    await expect(adapter().getObject('source')).rejects.toThrow('non-streaming body');
  });
});
