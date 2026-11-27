import { randomUUID } from "node:crypto";
import type { Readable } from "node:stream";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { S3Settings } from "../config.js";
import { contentDisposition } from "../util/text.js";
import { assertKey, healthcheckKey, joinUrl } from "./keys.js";
import { timed } from "./timed.js";
import type { ObjectInfo, PutOptions, StorageDriver, StoredObject, TestStep } from "./types.js";

function statusOf(err: unknown): number | undefined {
  return (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
}

function isNotFound(err: unknown): boolean {
  const name = (err as { name?: string })?.name;
  return statusOf(err) === 404 || name === "NoSuchKey" || name === "NotFound";
}

/**
 * Một adapter cho mọi kho tương thích S3 API: SeaweedFS (S3 gateway), MinIO, Cloudflare R2, AWS S3.
 * Khác biệt giữa các nhà cung cấp chỉ nằm ở cấu hình: endpoint, region, path-style và URL công khai.
 */
export class S3Storage implements StorageDriver {
  readonly kind = "s3" as const;
  private readonly client: S3Client;

  constructor(private readonly settings: S3Settings) {
    this.client = new S3Client({
      region: settings.region,
      ...(settings.endpoint ? { endpoint: settings.endpoint } : {}),
      // SeaweedFS/MinIO: http://host:8333/<bucket>/<key> thay vì http://<bucket>.host:8333/<key>
      forcePathStyle: settings.forcePathStyle,
      credentials: { accessKeyId: settings.accessKeyId, secretAccessKey: settings.secretAccessKey },
      // SDK v3 mới mặc định gửi checksum CRC32 cho mọi PutObject; một số bản SeaweedFS/MinIO/R2 cũ
      // không hiểu header này. Chỉ gửi checksum khi thao tác bắt buộc.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
      maxAttempts: 3,
      requestHandler: { connectionTimeout: 5_000, requestTimeout: 60_000 },
    });
  }

  describe() {
    const s = this.settings;
    return {
      driver: "s3",
      provider: s.provider,
      endpoint: s.endpoint ?? `AWS S3 (${s.region})`,
      region: s.region,
      bucket: s.bucket,
      forcePathStyle: s.forcePathStyle,
      accessKeyId: s.accessKeyId.length > 8 ? `${s.accessKeyId.slice(0, 4)}…${s.accessKeyId.slice(-4)}` : "****",
      publicBaseUrl: s.publicBaseUrl ?? null,
    };
  }

  async put(key: string, body: Buffer, options: PutOptions): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.settings.bucket,
        Key: assertKey(key),
        Body: body,
        ContentLength: body.length,
        ContentType: options.contentType,
        ...(options.cacheControl ? { CacheControl: options.cacheControl } : {}),
        ...(options.contentDisposition ? { ContentDisposition: options.contentDisposition } : {}),
      }),
    );
  }

  async get(key: string, options?: { ifNoneMatch?: string }): Promise<StoredObject | "not-modified" | null> {
    try {
      const res = await this.client.send(
        new GetObjectCommand({
          Bucket: this.settings.bucket,
          Key: assertKey(key),
          ...(options?.ifNoneMatch ? { IfNoneMatch: options.ifNoneMatch } : {}),
        }),
      );
      return {
        body: res.Body as Readable,
        ...(res.ContentType ? { contentType: res.ContentType } : {}),
        ...(res.ContentLength !== undefined ? { contentLength: res.ContentLength } : {}),
        ...(res.ETag ? { etag: res.ETag } : {}),
        ...(res.LastModified ? { lastModified: res.LastModified } : {}),
      };
    } catch (err) {
      if (statusOf(err) === 304) return "not-modified";
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.settings.bucket, Key: assertKey(key) }));
    } catch (err) {
      if (!isNotFound(err)) throw err;
    }
  }

  /**
   * Kiểm tra object bằng ListObjectsV2 thay vì HeadObject: một số reverse proxy trước S3 gateway
   * (ví dụ nginx bật proxy_cache trước SeaweedFS) chuyển HEAD thành GET làm sai chữ ký SigV4 -> 403.
   */
  async exists(key: string): Promise<boolean> {
    const res = await this.client.send(new ListObjectsV2Command({ Bucket: this.settings.bucket, Prefix: assertKey(key), MaxKeys: 1 }));
    return (res.Contents ?? []).some((o) => o.Key === key);
  }

  async *list(prefix: string): AsyncIterable<ObjectInfo> {
    let token: string | undefined;
    do {
      const res = await this.client.send(
        new ListObjectsV2Command({ Bucket: this.settings.bucket, Prefix: prefix, ...(token ? { ContinuationToken: token } : {}) }),
      );
      for (const obj of res.Contents ?? []) {
        if (obj.Key) yield { key: obj.Key, bytes: obj.Size ?? 0 };
      }
      token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);
  }

  directPublicUrl(key: string): string | null {
    return this.settings.publicBaseUrl ? joinUrl(this.settings.publicBaseUrl, key) : null;
  }

  async presignDownload(key: string, filename: string, expiresIn: number): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.settings.bucket,
        Key: assertKey(key),
        ResponseContentDisposition: contentDisposition("attachment", filename),
      }),
      { expiresIn },
    );
  }

  async test(): Promise<TestStep[]> {
    const key = healthcheckKey(randomUUID());
    const payload = Buffer.from(`photo-gallery healthcheck ${new Date().toISOString()}`);
    const steps: TestStep[] = [];

    steps.push(await timed(`PutObject ${key}`, () => this.put(key, payload, { contentType: "text/plain", cacheControl: "no-store" })));
    if (!steps.at(-1)!.ok) return steps;

    steps.push(
      await timed("ListObjectsV2 thấy object vừa ghi", async () => {
        if (!(await this.exists(key))) throw new Error("Object không tồn tại ngay sau khi ghi");
      }),
    );
    steps.push(
      await timed("GetObject và so sánh nội dung", async () => {
        const obj = await this.get(key);
        if (!obj || obj === "not-modified") throw new Error("Không đọc lại được object");
        const chunks: Buffer[] = [];
        for await (const chunk of obj.body) chunks.push(Buffer.from(chunk as Uint8Array));
        if (!Buffer.concat(chunks).equals(payload)) throw new Error("Nội dung đọc lại khác nội dung đã ghi");
      }),
    );

    const publicUrl = this.directPublicUrl(key);
    if (publicUrl) {
      steps.push(
        await timed(
          `Đọc qua URL công khai ${this.settings.publicBaseUrl}`,
          async () => {
            // User-Agent rõ ràng: Cloudflare có thể chặn UA mặc định của Node (lỗi 1010)
            const res = await fetch(publicUrl, {
              signal: AbortSignal.timeout(8_000),
              cache: "no-store",
              headers: { "User-Agent": "Mozilla/5.0 (compatible; PhotoGallery-HealthCheck/1.0)" },
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}: bucket/CDN chưa cho đọc công khai hoặc S3_PUBLIC_BASE_URL sai`);
            return `HTTP ${res.status}`;
          },
          true,
        ),
      );
    }

    steps.push(await timed("DeleteObject", () => this.delete(key)));
    steps.push(
      await timed("Xác nhận đã xóa", async () => {
        if (await this.exists(key)) throw new Error("Object vẫn còn sau khi xóa");
      }),
    );
    return steps;
  }
}
