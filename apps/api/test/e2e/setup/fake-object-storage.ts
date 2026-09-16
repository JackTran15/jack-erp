import { Injectable } from '@nestjs/common';
import {
  DownloadDisposition,
  ObjectStorageService,
  StoredObjectHead,
  UploadPolicy,
} from '../../../src/modules/media/object-storage.service';

interface FakeStoredObject {
  size: number;
  contentType: string;
  /** Bucket the ticket for this key was issued against; `undefined` matches any bucket. */
  bucket?: string;
}

type PublicSurface<T> = { [K in keyof T]: T[K] };

/**
 * Drop-in replacement for `ObjectStorageService` in E2E (T-01-11): never opens a
 * socket, so the suite stays green with MinIO stopped. `implements
 * PublicSurface<ObjectStorageService>` so a signature change on the real class
 * fails this file at compile time instead of drifting silently.
 */
@Injectable()
export class FakeObjectStorageService implements PublicSurface<ObjectStorageService> {
  private readonly objects = new Map<string, FakeStoredObject>();
  private readonly policyBuckets = new Map<string, string>();

  /** When set, thrown by `headObject`/`createUploadPolicy` (AC-19: storage unavailable). */
  failWith: Error | null = null;

  /** Simulates the browser having POSTed a file straight to storage at `key`. */
  putFake(key: string, size: number, contentType: string): void {
    this.objects.set(key, { size, contentType, bucket: this.policyBuckets.get(key) });
  }

  reset(): void {
    this.objects.clear();
    this.policyBuckets.clear();
    this.failWith = null;
  }

  async headObject(bucket: string, key: string): Promise<StoredObjectHead | null> {
    if (this.failWith) throw this.failWith;
    const object = this.objects.get(key);
    if (!object) return null;
    if (object.bucket !== undefined && object.bucket !== bucket) return null;
    return { contentLength: object.size, contentType: object.contentType };
  }

  async deleteObject(bucket: string, key: string): Promise<void> {
    const object = this.objects.get(key);
    if (!object) return;
    if (object.bucket !== undefined && object.bucket !== bucket) return;
    this.objects.delete(key);
  }

  async createUploadPolicy(bucket: string, key: string, contentType: string): Promise<UploadPolicy> {
    if (this.failWith) throw this.failWith;
    this.policyBuckets.set(key, bucket);
    return {
      url: `https://fake-object-storage.test/${bucket}`,
      fields: { key, 'Content-Type': contentType },
    };
  }

  async signGetUrl(
    bucket: string,
    key: string,
    expiresSec: number,
    disposition?: DownloadDisposition,
  ): Promise<string> {
    if (!disposition) return `https://fake-object-storage.test/${bucket}/${key}`;
    const fileNameParam = disposition.fileName
      ? `&filename=${encodeURIComponent(disposition.fileName)}`
      : '';
    return `https://fake-object-storage.test/${bucket}/${key}?disposition=${disposition.type}${fileNameParam}`;
  }

  async ensureBuckets(): Promise<void> {}
}
