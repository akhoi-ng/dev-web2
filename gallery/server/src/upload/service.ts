import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { Config, Fault } from "../config.js";
import { FileRejection, badRequest } from "../errors.js";
import { blurPlaceholder, generateVariants, inspectImage, normalizeImage } from "../images/pipeline.js";
import { detectSignature } from "../images/signature.js";
import { log } from "../log.js";
import type { CleanupQueue, CompensationResult } from "../photos/cleanup.js";
import { photoInclude, toPhotoDto, type PhotoDto, type UrlBuilder } from "../photos/serialize.js";
import { originalKey, variantKey } from "../storage/keys.js";
import type { StorageRegistry } from "../storage/index.js";
import { describeError } from "../storage/timed.js";
import { Semaphore } from "../util/semaphore.js";
import { contentDisposition, normalizeTags, slugify, titleFromFilename } from "../util/text.js";
import type { ParsedUpload, ReceivedFile } from "./multipart.js";

export const IMMUTABLE_CACHE = "public, max-age=31536000, immutable";

export type UploadStage = "validating" | "processing" | "storing" | "saving";

export type UploadEvent =
  | { type: "stage"; index: number; stage: UploadStage }
  | { type: "file"; result: FileResult };

export type FileResult =
  | { index: number; filename: string; ok: true; photo: PhotoDto }
  | {
      index: number;
      filename: string;
      ok: false;
      error: { code: string; message: string; details?: Record<string, unknown> };
      cleanup?: CompensationResult;
    };

export interface UploadResponse {
  status: number;
  summary: { received: number; accepted: number; rejected: number };
  limits: { maxFiles: number; maxFileBytes: number; maxRequestBytes: number; maxPixels: number; formats: string[] };
  results: FileResult[];
}

const ItemSchema = z.object({
  title: z.string().trim().max(120).optional(),
  altText: z.string().trim().max(300).optional(),
  description: z.string().trim().max(2000).optional(),
});

const MetaSchema = z.object({
  title: z.string().trim().max(120).optional(),
  altText: z.string().trim().max(300).optional(),
  alt: z.string().trim().max(300).optional(),
  description: z.string().trim().max(2000).optional(),
  albumId: z.union([z.uuid(), z.literal("")]).optional(),
  tags: z.string().max(400).optional(),
  // Tên kho muốn lưu (một tên trong STORAGE_PROFILES); bỏ trống = kho mặc định
  storage: z.string().trim().max(40).optional(),
  items: z.string().max(60_000).optional(),
});

export interface UploadMeta {
  defaults: z.infer<typeof ItemSchema>;
  items: z.infer<typeof ItemSchema>[];
  albumId: string | null;
  tags: string[];
  /** null = kho mặc định */
  storage: string | null;
}

/**
 * Trường text đi kèm file trong cùng request:
 *   title, altText, description  giá trị dùng chung cho mọi file (form HTML đơn giản)
 *   items                        JSON [{ title, altText, description }, ...] theo thứ tự file, ghi đè giá trị chung
 *   albumId, tags                album và tag (cách nhau dấu phẩy) cho cả lượt upload
 */
export function parseUploadMeta(fields: Record<string, string>): UploadMeta {
  const meta = MetaSchema.safeParse(fields);
  if (!meta.success) throw badRequest("INVALID_FIELDS", "Trường mô tả không hợp lệ", meta.error.issues);
  let items: z.infer<typeof ItemSchema>[] = [];
  if (meta.data.items) {
    let raw: unknown;
    try {
      raw = JSON.parse(meta.data.items);
    } catch {
      throw badRequest("INVALID_ITEMS", 'Trường "items" phải là JSON');
    }
    const parsed = z.array(ItemSchema).max(50).safeParse(raw);
    if (!parsed.success) throw badRequest("INVALID_ITEMS", 'Trường "items" không hợp lệ', parsed.error.issues);
    items = parsed.data;
  }
  return {
    defaults: {
      ...(meta.data.title ? { title: meta.data.title } : {}),
      ...(meta.data.altText || meta.data.alt ? { altText: meta.data.altText || meta.data.alt } : {}),
      ...(meta.data.description ? { description: meta.data.description } : {}),
    },
    items,
    albumId: meta.data.albumId ? meta.data.albumId : null,
    tags: normalizeTags(meta.data.tags),
    storage: meta.data.storage ? meta.data.storage.toLowerCase() : null,
  };
}

interface Deps {
  prisma: PrismaClient;
  storages: StorageRegistry;
  cleanup: CleanupQueue;
  urls: UrlBuilder;
  upload: Config["upload"];
  faults: Set<Fault>;
}

export class UploadService {
  private readonly semaphore: Semaphore;

  constructor(private readonly deps: Deps) {
    this.semaphore = new Semaphore(deps.upload.concurrency);
  }

  get limits(): UploadResponse["limits"] {
    const u = this.deps.upload;
    return { maxFiles: u.maxFiles, maxFileBytes: u.maxFileBytes, maxRequestBytes: u.maxRequestBytes, maxPixels: u.maxPixels, formats: ["image/jpeg", "image/png"] };
  }

  async handle(upload: ParsedUpload, meta: UploadMeta, uploadedById: string | null, onEvent?: (e: UploadEvent) => void): Promise<UploadResponse> {
    if (meta.albumId) {
      const album = await this.deps.prisma.album.findUnique({ where: { id: meta.albumId }, select: { id: true } });
      if (!album) throw badRequest("ALBUM_NOT_FOUND", "Album không tồn tại");
    }
    const storageName = this.resolveStorage(meta.storage);
    const results: FileResult[] = [];
    // Xử lý tuần tự trong một request để giới hạn RAM; semaphore giới hạn tổng số ảnh xử lý cùng lúc
    for (const file of upload.files) {
      const result = await this.semaphore.run(() => this.processOne(file, meta, storageName, uploadedById, (stage) => onEvent?.({ type: "stage", index: file.index, stage })));
      // Ảnh chỉ nằm trong RAM: bỏ tham chiếu ngay sau khi xử lý để giải phóng bộ nhớ cho file tiếp theo
      file.data = null;
      results.push(result);
      onEvent?.({ type: "file", result });
    }
    const accepted = results.filter((r) => r.ok).length;
    const rejected = results.length - accepted;
    return {
      status: rejected === 0 ? 201 : accepted === 0 ? 422 : 207,
      summary: { received: results.length, accepted, rejected },
      limits: this.limits,
      results,
    };
  }

  /** Kho admin chọn (đã kiểm tra có trong STORAGE_PROFILES) hoặc kho mặc định. */
  resolveStorage(requested: string | null): string {
    const name = requested ?? this.deps.storages.defaultName;
    if (!this.deps.storages.has(name)) {
      throw badRequest("UNKNOWN_STORAGE", `Kho "${name}" không có trong cấu hình (${this.deps.storages.names.join(", ")})`);
    }
    return name;
  }

  private async processOne(
    file: ReceivedFile,
    meta: UploadMeta,
    storageName: string,
    uploadedById: string | null,
    stage: (s: UploadStage) => void,
  ): Promise<FileResult> {
    const base = { index: file.index, filename: file.filename };
    const storage = this.deps.storages.get(storageName);
    let cleanup: CompensationResult | undefined;
    try {
      // 1. KIỂM TRA: bytes -> chữ ký -> header/pixel -> giải mã toàn bộ
      stage("validating");
      const { maxFileBytes, maxPixels, variants: specs } = this.deps.upload;
      if (file.oversize) {
        throw new FileRejection("FILE_TOO_LARGE", `File vượt ${(maxFileBytes / 1024 / 1024).toFixed(0)} MiB`, { maxFileBytes, receivedBytes: file.bytes });
      }
      if (file.bytes === 0 || !file.data) throw new FileRejection("EMPTY_FILE", "File rỗng");
      const format = detectSignature(file.head);
      if (!format) {
        throw new FileRejection("UNSUPPORTED_TYPE", "Chỉ nhận ảnh JPEG hoặc PNG (kiểm tra theo chữ ký file, không theo đuôi file)", {
          declaredMime: file.declaredMime,
          signature: file.head.subarray(0, 8).toString("hex"),
        });
      }
      await inspectImage(file.data, format, maxPixels);

      // 2. XỬ LÝ: xoay theo EXIF rồi bỏ EXIF, sinh variant WebP
      stage("processing");
      const normalized = await normalizeImage(file.data, format, maxPixels);
      const variants = await generateVariants(normalized, specs);
      const blurDataUrl = await blurPlaceholder(normalized);

      // File đã hợp lệ: tạo photoId và storage key
      const photoId = randomUUID();
      const version = 1;
      const item = { ...meta.defaults, ...stripEmpty(meta.items[file.index] ?? {}) };
      const title = item.title || titleFromFilename(file.filename);
      const objects = [
        ...variants.map((v) => ({
          key: variantKey(photoId, version, v.width),
          body: v.buffer,
          options: { contentType: v.mime, cacheControl: IMMUTABLE_CACHE },
        })),
        {
          key: originalKey(photoId, normalized.ext),
          body: normalized.buffer,
          options: {
            contentType: normalized.mime,
            cacheControl: "private, no-store",
            contentDisposition: contentDisposition("attachment", `${slugify(title) || "photo"}.${normalized.ext}`),
          },
        },
      ];
      const keys = objects.map((o) => o.key);

      // 3. LƯU FILE: ghi đủ mọi file trước khi ghi metadata
      stage("storing");
      const writes = await Promise.allSettled(objects.map((o) => storage.put(o.key, o.body, o.options)));
      const failedWrite = writes.find((w): w is PromiseRejectedResult => w.status === "rejected");
      if (failedWrite) {
        // Xóa bù MỌI key đã thử ghi (ghi "lỗi" do timeout vẫn có thể đã thành công ở phía kho)
        cleanup = await this.deps.cleanup.compensate(storageName, keys, "STORAGE_WRITE_FAILED", photoId);
        throw new FileRejection("STORAGE_WRITE_FAILED", "Không ghi được file vào kho lưu trữ", { reason: describeError(failedWrite.reason) });
      }

      // 4. GHI METADATA trong một transaction; 5. CÔNG BỐ khi commit thành công
      stage("saving");
      let record;
      try {
        record = await this.deps.prisma.$transaction(async (tx) => {
          const created = await tx.photo.create({
            data: {
              id: photoId,
              title,
              altText: item.altText || title,
              description: item.description || null,
              tags: meta.tags,
              albumId: meta.albumId,
              storage: storageName,
              status: "PUBLISHED",
              width: normalized.width,
              height: normalized.height,
              sourceFilename: file.filename,
              sourceFormat: format,
              sourceBytes: file.bytes,
              originalKey: originalKey(photoId, normalized.ext),
              originalMime: normalized.mime,
              originalBytes: normalized.buffer.length,
              currentVersion: version,
              blurDataUrl,
              uploadedById,
              variants: {
                create: variants.map((v) => ({
                  version,
                  width: v.width,
                  height: v.height,
                  mime: v.mime,
                  bytes: v.bytes,
                  storageKey: variantKey(photoId, version, v.width),
                })),
              },
            },
            include: photoInclude,
          });
          if (this.deps.faults.has("db-commit")) {
            throw new Error("[FAULT_INJECTION db-commit] Giả lập DB lỗi trước khi commit");
          }
          return created;
        });
      } catch (err) {
        // Giao dịch DB đã rollback nhưng không hoàn tác được file trong kho: xóa bù các file vừa ghi
        cleanup = await this.deps.cleanup.compensate(storageName, keys, "DB_WRITE_FAILED", photoId);
        throw new FileRejection("DB_WRITE_FAILED", "Không lưu được metadata; các file vừa ghi đã được dọn", { reason: describeError(err) });
      }

      return { ...base, ok: true, photo: toPhotoDto(record, this.deps.urls, { admin: true }) };
    } catch (err) {
      if (err instanceof FileRejection) {
        return { ...base, ok: false, error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) }, ...(cleanup ? { cleanup } : {}) };
      }
      log.error("Lỗi không mong đợi khi xử lý file upload", { index: file.index, error: describeError(err) });
      return { ...base, ok: false, error: { code: "INTERNAL_ERROR", message: "Lỗi máy chủ khi xử lý ảnh" }, ...(cleanup ? { cleanup } : {}) };
    }
  }
}

function stripEmpty<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== "")) as Partial<T>;
}
