import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  HeadObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
  PutBucketPolicyCommand,
  GetBucketPolicyCommand,
  NotFound,
} from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ObjectStorageService } from './object-storage.service';

jest.mock('@aws-sdk/s3-presigned-post');
jest.mock('@aws-sdk/s3-request-presigner');

const VALID_ENV: Record<string, string> = {
  MEDIA_S3_ENDPOINT: 'http://minio.internal:9000',
  MEDIA_PUBLIC_BASE_URL: 'http://public.example.com',
  MEDIA_S3_REGION: 'us-east-1',
  MEDIA_S3_ACCESS_KEY: 'REDACTED',
  MEDIA_S3_SECRET_KEY: 'REDACTED',
  MEDIA_BUCKET_PUBLIC: 'erp-media-public',
  MEDIA_BUCKET_PRIVATE: 'erp-media-private',
};

function makeService(env: Record<string, string | undefined> = VALID_ENV): ObjectStorageService {
  return new ObjectStorageService(new ConfigService(env));
}

function s3ErrorNamed(name: string, httpStatusCode?: number): Error {
  const err = new Error(name) as Error & { $metadata?: { httpStatusCode?: number } };
  err.name = name;
  if (httpStatusCode) err.$metadata = { httpStatusCode };
  return err;
}

function connectionRefusedError(): NodeJS.ErrnoException {
  const err = new Error('connect ECONNREFUSED 127.0.0.1:9000') as NodeJS.ErrnoException;
  err.code = 'ECONNREFUSED';
  return err;
}

function noSuchBucketPolicyError(): Error {
  return s3ErrorNamed('NoSuchBucketPolicy', 404);
}

/** Default `ensureBuckets` happy path: bucket exists, private bucket has no policy. */
async function cleanEnsureBucketsSend(command: unknown): Promise<unknown> {
  if (command instanceof GetBucketPolicyCommand) throw noSuchBucketPolicyError();
  return {};
}

describe('ObjectStorageService', () => {
  let sendSpy: jest.SpyInstance;

  beforeEach(() => {
    sendSpy = jest.spyOn(S3Client.prototype, 'send');
    // Any command nobody explicitly mocks fails loudly instead of reaching the
    // real network.
    sendSpy.mockRejectedValue(new Error('unmocked S3 call'));
    (createPresignedPost as jest.Mock).mockReset();
    (getSignedUrl as jest.Mock).mockReset();
  });

  afterEach(() => {
    sendSpy.mockRestore();
  });

  describe('when configuration is missing', () => {
    it('throws STORAGE_UNAVAILABLE (503) from every method', async () => {
      const service = makeService({ ...VALID_ENV, MEDIA_S3_ENDPOINT: undefined });

      await expect(service.headObject('bucket', 'key')).rejects.toMatchObject({
        code: 'STORAGE_UNAVAILABLE',
        status: 503,
      });
      await expect(service.deleteObject('bucket', 'key')).rejects.toMatchObject({
        code: 'STORAGE_UNAVAILABLE',
        status: 503,
      });
      await expect(
        service.createUploadPolicy('bucket', 'key', 'image/png', 1024, 600),
      ).rejects.toMatchObject({ code: 'STORAGE_UNAVAILABLE', status: 503 });
      await expect(service.signGetUrl('bucket', 'key', 900)).rejects.toMatchObject({
        code: 'STORAGE_UNAVAILABLE',
        status: 503,
      });
      await expect(service.ensureBuckets()).rejects.toMatchObject({
        code: 'STORAGE_UNAVAILABLE',
        status: 503,
      });
      expect(sendSpy).not.toHaveBeenCalled();
    });
  });

  describe('headObject', () => {
    it('returns the size and content type on success', async () => {
      sendSpy.mockResolvedValueOnce({ ContentLength: 1234, ContentType: 'image/png' });
      const service = makeService();

      const result = await service.headObject('erp-media-public', 'org/1/item/2');

      expect(result).toEqual({ contentLength: 1234, contentType: 'image/png' });
      const command = sendSpy.mock.calls[0][0];
      expect(command).toBeInstanceOf(HeadObjectCommand);
      expect(command.input).toEqual({ Bucket: 'erp-media-public', Key: 'org/1/item/2' });
    });

    it('returns null when the object does not exist', async () => {
      sendSpy.mockRejectedValueOnce(new NotFound({ message: 'not found', $metadata: {} }));
      const service = makeService();

      await expect(service.headObject('erp-media-public', 'missing-key')).resolves.toBeNull();
    });

    it('maps a connection failure to STORAGE_UNAVAILABLE', async () => {
      sendSpy.mockRejectedValueOnce(connectionRefusedError());
      const service = makeService();

      await expect(service.headObject('erp-media-public', 'key')).rejects.toMatchObject({
        code: 'STORAGE_UNAVAILABLE',
        status: 503,
      });
    });

    it('does not swallow an unrelated S3 error', async () => {
      const err = s3ErrorNamed('AccessDenied', 403);
      sendSpy.mockRejectedValueOnce(err);
      const service = makeService();

      await expect(service.headObject('erp-media-public', 'key')).rejects.toBe(err);
    });
  });

  describe('deleteObject', () => {
    it('sends a DeleteObjectCommand for the given bucket/key', async () => {
      sendSpy.mockResolvedValueOnce({});
      const service = makeService();

      await service.deleteObject('erp-media-private', 'org/1/goods_receipt/3');

      const command = sendSpy.mock.calls[0][0];
      expect(command).toBeInstanceOf(DeleteObjectCommand);
      expect(command.input).toEqual({ Bucket: 'erp-media-private', Key: 'org/1/goods_receipt/3' });
    });

    it('maps a connection failure to STORAGE_UNAVAILABLE', async () => {
      sendSpy.mockRejectedValueOnce(connectionRefusedError());
      const service = makeService();

      await expect(service.deleteObject('erp-media-private', 'key')).rejects.toMatchObject({
        code: 'STORAGE_UNAVAILABLE',
      });
    });
  });

  describe('createUploadPolicy', () => {
    it('requests a content-length-range and exact Content-Type condition', async () => {
      (createPresignedPost as jest.Mock).mockResolvedValueOnce({
        url: 'http://public.example.com/erp-media-public',
        fields: { key: 'org/1/item/2', 'Content-Type': 'image/png' },
      });
      const service = makeService();

      const policy = await service.createUploadPolicy(
        'erp-media-public',
        'org/1/item/2',
        'image/png',
        2 * 1024 * 1024,
        600,
      );

      expect(policy).toEqual({
        url: 'http://public.example.com/erp-media-public',
        fields: { key: 'org/1/item/2', 'Content-Type': 'image/png' },
      });

      expect(createPresignedPost).toHaveBeenCalledTimes(1);
      const [client, options] = (createPresignedPost as jest.Mock).mock.calls[0];
      expect(client).toBeInstanceOf(S3Client);
      expect(options).toMatchObject({
        Bucket: 'erp-media-public',
        Key: 'org/1/item/2',
        Expires: 600,
      });
      expect(options.Conditions).toContainEqual(['content-length-range', 1, 2 * 1024 * 1024]);
      expect(options.Conditions).toContainEqual({ 'Content-Type': 'image/png' });
      expect(options.Fields).toMatchObject({ 'Content-Type': 'image/png' });
    });

    it('maps a connection failure to STORAGE_UNAVAILABLE', async () => {
      (createPresignedPost as jest.Mock).mockRejectedValueOnce(connectionRefusedError());
      const service = makeService();

      await expect(
        service.createUploadPolicy('erp-media-public', 'key', 'image/png', 1024, 600),
      ).rejects.toMatchObject({ code: 'STORAGE_UNAVAILABLE' });
    });
  });

  describe('signGetUrl', () => {
    it('signs a GET url that expires after expiresSec, with no filename parameters when disposition has no fileName', async () => {
      (getSignedUrl as jest.Mock).mockResolvedValueOnce('http://public.example.com/signed?X-Amz-Expires=900');
      const service = makeService();

      const url = await service.signGetUrl('erp-media-private', 'org/1/goods_receipt/3', 900, {
        type: 'attachment',
      });

      expect(url).toBe('http://public.example.com/signed?X-Amz-Expires=900');
      const [client, command, options] = (getSignedUrl as jest.Mock).mock.calls[0];
      expect(client).toBeInstanceOf(S3Client);
      expect(command.input).toMatchObject({
        Bucket: 'erp-media-private',
        Key: 'org/1/goods_receipt/3',
        ResponseContentDisposition: 'attachment',
      });
      expect(options).toEqual({ expiresIn: 900 });
    });

    it('omits ResponseContentDisposition entirely when no disposition is given', async () => {
      (getSignedUrl as jest.Mock).mockResolvedValueOnce('http://public.example.com/signed');
      const service = makeService();

      await service.signGetUrl('erp-media-private', 'key', 900);

      const [, command] = (getSignedUrl as jest.Mock).mock.calls[0];
      expect(command.input.ResponseContentDisposition).toBeUndefined();
    });

    it('builds an RFC 5987 filename* alongside an ASCII fallback for a Vietnamese file name', async () => {
      (getSignedUrl as jest.Mock).mockResolvedValueOnce('http://public.example.com/signed');
      const service = makeService();

      await service.signGetUrl('erp-media-private', 'key', 900, {
        type: 'attachment',
        fileName: 'hóa đơn.pdf',
      });

      const [, command] = (getSignedUrl as jest.Mock).mock.calls[0];
      expect(command.input.ResponseContentDisposition).toBe(
        `attachment; filename="ha n.pdf"; filename*=UTF-8''h%C3%B3a%20%C4%91%C6%A1n.pdf`,
      );
    });

    it('strips quotes and CR/LF from the ASCII fallback but keeps them (percent-encoded) in filename*', async () => {
      (getSignedUrl as jest.Mock).mockResolvedValueOnce('http://public.example.com/signed');
      const service = makeService();

      await service.signGetUrl('erp-media-private', 'key', 900, {
        type: 'attachment',
        fileName: 'a"b\r\nc.pdf',
      });

      const [, command] = (getSignedUrl as jest.Mock).mock.calls[0];
      expect(command.input.ResponseContentDisposition).toBe(
        `attachment; filename="abc.pdf"; filename*=UTF-8''a%22b%0D%0Ac.pdf`,
      );
    });

    it('is just the bare type for inline without a file name', async () => {
      (getSignedUrl as jest.Mock).mockResolvedValueOnce('http://public.example.com/signed');
      const service = makeService();

      await service.signGetUrl('erp-media-private', 'key', 900, { type: 'inline' });

      const [, command] = (getSignedUrl as jest.Mock).mock.calls[0];
      expect(command.input.ResponseContentDisposition).toBe('inline');
    });

    it('is just the bare type for an explicitly empty file name (falsy, same as omitted)', async () => {
      (getSignedUrl as jest.Mock).mockResolvedValueOnce('http://public.example.com/signed');
      const service = makeService();

      await service.signGetUrl('erp-media-private', 'key', 900, { type: 'attachment', fileName: '' });

      const [, command] = (getSignedUrl as jest.Mock).mock.calls[0];
      expect(command.input.ResponseContentDisposition).toBe('attachment');
    });

    it('omits the ASCII filename= parameter (keeps only filename*) when the name is entirely non-ASCII', async () => {
      (getSignedUrl as jest.Mock).mockResolvedValueOnce('http://public.example.com/signed');
      const service = makeService();

      await service.signGetUrl('erp-media-private', 'key', 900, { type: 'attachment', fileName: '文件' });

      const [, command] = (getSignedUrl as jest.Mock).mock.calls[0];
      expect(command.input.ResponseContentDisposition).toBe(
        `attachment; filename*=UTF-8''%E6%96%87%E4%BB%B6`,
      );
    });

    it('replaces a lone surrogate with U+FFFD instead of letting encodeURIComponent throw', async () => {
      (getSignedUrl as jest.Mock).mockResolvedValueOnce('http://public.example.com/signed');
      const service = makeService();

      await service.signGetUrl('erp-media-private', 'key', 900, {
        type: 'attachment',
        fileName: 'a\uD800b.pdf',
      });

      const [, command] = (getSignedUrl as jest.Mock).mock.calls[0];
      expect(command.input.ResponseContentDisposition).toBe(
        `attachment; filename="ab.pdf"; filename*=UTF-8''a%EF%BF%BDb.pdf`,
      );
    });

    it('throws synchronously (not a 503) when disposition.type is not "inline" or "attachment"', async () => {
      const service = makeService();

      await expect(
        service.signGetUrl('erp-media-private', 'key', 900, {
          type: 'inline; filename=evil.html' as unknown as 'inline',
        }),
      ).rejects.toThrow(/Invalid Content-Disposition type/);
      expect(getSignedUrl).not.toHaveBeenCalled();
    });

    it('maps a connection failure to STORAGE_UNAVAILABLE', async () => {
      (getSignedUrl as jest.Mock).mockRejectedValueOnce(connectionRefusedError());
      const service = makeService();

      await expect(service.signGetUrl('erp-media-private', 'key', 900)).rejects.toMatchObject({
        code: 'STORAGE_UNAVAILABLE',
      });
    });
  });

  describe('ensureBuckets', () => {
    it('creates a missing bucket and applies an anonymous GetObject-only policy to the public bucket', async () => {
      sendSpy.mockImplementation(async (command) => {
        if (command instanceof HeadBucketCommand) {
          throw new NotFound({ message: 'not found', $metadata: {} });
        }
        return cleanEnsureBucketsSend(command);
      });
      const service = makeService();

      await service.ensureBuckets();

      const creates = sendSpy.mock.calls
        .map(([command]) => command)
        .filter((command) => command instanceof CreateBucketCommand);
      expect(creates.map((c) => c.input.Bucket).sort()).toEqual(
        ['erp-media-private', 'erp-media-public'].sort(),
      );

      const policies = sendSpy.mock.calls
        .map(([command]) => command)
        .filter((command) => command instanceof PutBucketPolicyCommand);
      expect(policies).toHaveLength(1);
      expect(policies[0].input.Bucket).toBe('erp-media-public');
      const policy = JSON.parse(policies[0].input.Policy as string);
      expect(policy.Statement).toHaveLength(1);
      expect(policy.Statement[0].Action).toEqual(['s3:GetObject']);
      expect(policy.Statement[0].Principal).toBe('*');
      expect(policy.Statement[0].Resource).toEqual(['arn:aws:s3:::erp-media-public/*']);
    });

    it('does not create a bucket that already exists and skips PutBucketPolicy for the private bucket', async () => {
      sendSpy.mockImplementation(cleanEnsureBucketsSend);
      const service = makeService();

      await service.ensureBuckets();

      expect(sendSpy.mock.calls.some(([c]) => c instanceof CreateBucketCommand)).toBe(false);
      const policies = sendSpy.mock.calls
        .map(([command]) => command)
        .filter((command) => command instanceof PutBucketPolicyCommand);
      expect(policies).toHaveLength(1);
      expect(policies[0].input.Bucket).toBe('erp-media-public');
    });

    it('checks the private bucket for an existing policy on every run', async () => {
      sendSpy.mockImplementation(cleanEnsureBucketsSend);
      const service = makeService();

      await service.ensureBuckets();

      const policyChecks = sendSpy.mock.calls
        .map(([command]) => command)
        .filter((command) => command instanceof GetBucketPolicyCommand);
      expect(policyChecks).toHaveLength(1);
      expect(policyChecks[0].input.Bucket).toBe('erp-media-private');
    });

    it('throws a clear, named error and does not delete anything when the private bucket already has a policy', async () => {
      sendSpy.mockImplementation(async (command) => {
        if (command instanceof GetBucketPolicyCommand) {
          return { Policy: '{"Version":"2012-10-17","Statement":[]}' };
        }
        return {};
      });
      const service = makeService();

      await expect(service.ensureBuckets()).rejects.toThrow(/erp-media-private/);

      expect(sendSpy.mock.calls.some(([c]) => c.constructor.name === 'DeleteBucketPolicyCommand')).toBe(
        false,
      );
    });

    it('is idempotent: running twice yields the same calls', async () => {
      sendSpy.mockImplementation(cleanEnsureBucketsSend);
      const service = makeService();

      await service.ensureBuckets();
      await service.ensureBuckets();

      const policies = sendSpy.mock.calls
        .map(([command]) => command)
        .filter((command) => command instanceof PutBucketPolicyCommand);
      expect(policies).toHaveLength(2);
      expect(policies.every((p) => p.input.Bucket === 'erp-media-public')).toBe(true);
    });

    it('maps a connection failure on HeadBucket to STORAGE_UNAVAILABLE', async () => {
      sendSpy.mockRejectedValueOnce(connectionRefusedError());
      const service = makeService();

      await expect(service.ensureBuckets()).rejects.toMatchObject({ code: 'STORAGE_UNAVAILABLE' });
    });
  });
});
