import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { Config, Fault } from "../config.js";
import { HttpError, conflict, notFound } from "../errors.js";
import { EditValidationError, IDENTITY_EDIT, editedSize, normalizeEditParams, previewOf, renderEdit, sameEdit, type EditParams } from "../images/edit.js";
import { blurPlaceholder, generateVariants } from "../images/pipeline.js";
import { log } from "../log.js";
import { variantKey } from "../storage/keys.js";
import type { StorageDriver, StorageRegistry } from "../storage/index.js";
import { describeError } from "../storage/timed.js";
import { IMMUTABLE_CACHE } from "../upload/service.js";
import type { Semaphore } from "../util/semaphore.js";
import type { CleanupQueue, CompensationResult } from "./cleanup.js";
import { photoInclude, toPhotoDto, type PhotoDto, type UrlBuilder } from "./serialize.js";

/** Body của POST /api/admin/photos/:id/edit */
export const EditRequestSchema = z
  .object({
    // Version người dùng đang sửa; khác version đang công bố -> 409 (có người vừa lưu trước)
    baseVersion: z.number().int().min(1),
    // Khôi phục: sinh lại variant từ bản gốc chuẩn hóa, bỏ qua crop/rotate/flipH trong cùng request
    restore: z.boolean().optional(),
    crop: z
      .object({ x: z.number().int(), y: z.number().int(), width: z.number().int(), height: z.number().int() })
      .strict()
      .nullable()
      .optional(),
    rotate: z.number().int().optional(),
    flipH: z.boolean().optional(),
  })
  .strict();

export type EditRequest = z.infer<typeof EditRequestSchema>;

export interface EditResult {
  status: 200 | 201;
  /** false khi thông số trùng version đang công bố: không tạo version mới */
  changed: boolean;
  version: number;
  photo: PhotoDto;
  /** Version vừa bị thay thế; file của nó được giữ tới hạn rồi mới dọn */
  supersededVersion?: number;
  oldFilesDeleteAfter?: string;
}

interface Deps {
  prisma: PrismaClient;
  storages: StorageRegistry;
  cleanup: CleanupQueue;
  urls: UrlBuilder;
  upload: Config["upload"];
  faults: Set<Fault>;
  semaphore: Semaphore;
  versionRetentionMs: number;
}

/** Bản gốc chuẩn hóa sau upload có thể lớn hơn file gửi lên (PNG nén lại); chặn ở mức an toàn. */
const MAX_ORIGINAL_BYTES = 256 * 1024 * 1024;

export class EditError extends HttpError {
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(status, code, message, details);
  }
}

/**
 * Chỉnh sửa ảnh theo version:
 *   1. Kiểm tra thông số với kích thước bản gốc (request sai -> 422, ảnh đang công bố không đổi)
 *   2. Cấp số version mới (tăng nguyên tử Photo.versionSeq)
 *   3. Đọc bản gốc chuẩn hóa, cắt/xoay/lật, sinh variant WebP
 *   4. Ghi đủ file dưới photos/<id>/v<n>/ (không ghi đè version cũ: browser/CDN còn cache URL cũ)
 *   5. Transaction: thêm PhotoVariant + PhotoVersion, đánh dấu version cũ superseded, đổi
 *      currentVersion CÓ ĐIỀU KIỆN currentVersion = baseVersion. Lỗi/đụng độ -> rollback, xóa file mới.
 */
export class EditService {
  constructor(private readonly deps: Deps) {}

  async edit(photoId: string, input: EditRequest): Promise<EditResult> {
    const { prisma } = this.deps;
    const photo = await prisma.photo.findUnique({ where: { id: photoId }, include: photoInclude });
    if (!photo || photo.status === "DELETING") throw notFound("Ảnh không tồn tại");
    if (photo.currentVersion !== input.baseVersion) throw versionConflict(photo.currentVersion, input.baseVersion);

    let params: EditParams;
    try {
      params = input.restore
        ? IDENTITY_EDIT
        : normalizeEditParams({ crop: input.crop ?? null, rotate: (input.rotate ?? 0) as EditParams["rotate"], flipH: input.flipH ?? false }, photo);
    } catch (err) {
      if (err instanceof EditValidationError) throw new EditError(422, "INVALID_EDIT", err.message, err.details);
      throw err;
    }

    const current = photo.versions[0];
    const currentParams = current ? paramsOf(current) : IDENTITY_EDIT;
    if (sameEdit(params, currentParams)) {
      return { status: 200, changed: false, version: photo.currentVersion, photo: toPhotoDto(photo, this.deps.urls, { admin: true }) };
    }

    const storage = this.deps.storages.tryGet(photo.storage);
    if (!storage) throw new EditError(409, "STORAGE_UNAVAILABLE", `Kho "${photo.storage}" của ảnh không còn trong cấu hình`);

    return this.deps.semaphore.run(async () => {
      // Đọc bản gốc trước khi cấp version: kho lỗi thì không tốn số version nào
      const original = await readAll(storage, photo.originalKey);

      const { versionSeq: version } = await prisma.photo.update({
        where: { id: photoId },
        data: { versionSeq: { increment: 1 } },
        select: { versionSeq: true },
      });

      let rendered;
      try {
        rendered = await renderEdit(original, params, this.deps.upload.maxPixels);
      } catch (err) {
        throw new EditError(422, "EDIT_FAILED", "Không xử lý được ảnh với thông số này", { reason: describeError(err) });
      }
      const size = editedSize(params, photo);
      const variants = await generateVariants(rendered, this.deps.upload.variants);
      const blurDataUrl = await blurPlaceholder(rendered);
      const objects = variants.map((v) => ({ key: variantKey(photoId, version, v.width), v }));
      const keys = objects.map((o) => o.key);

      const writes = await Promise.allSettled(objects.map((o) => storage.put(o.key, o.v.buffer, { contentType: o.v.mime, cacheControl: IMMUTABLE_CACHE })));
      const failedWrite = writes.find((w): w is PromiseRejectedResult => w.status === "rejected");
      if (failedWrite) {
        const cleanup = await this.deps.cleanup.compensate(photo.storage, keys, "EDIT_STORAGE_WRITE_FAILED", photoId);
        throw new EditError(502, "STORAGE_WRITE_FAILED", "Không ghi được file của version mới; ảnh đang công bố không đổi", {
          reason: describeError(failedWrite.reason),
          cleanup,
        });
      }

      const now = new Date();
      let record;
      try {
        record = await prisma.$transaction(async (tx) => {
          // Đổi version có điều kiện: chỉ một trong các lần lưu đồng thời từ cùng baseVersion thắng
          const switched = await tx.photo.updateMany({
            where: { id: photoId, currentVersion: input.baseVersion, status: { not: "DELETING" } },
            data: { currentVersion: version, blurDataUrl },
          });
          if (switched.count !== 1) throw new VersionRace();
          await tx.photoVersion.updateMany({ where: { photoId, supersededAt: null }, data: { supersededAt: now } });
          await tx.photoVersion.create({
            data: {
              photoId,
              version,
              width: size.width,
              height: size.height,
              blurDataUrl,
              cropX: params.crop?.x ?? null,
              cropY: params.crop?.y ?? null,
              cropWidth: params.crop?.width ?? null,
              cropHeight: params.crop?.height ?? null,
              rotate: params.rotate,
              flipH: params.flipH,
              createdAt: now,
            },
          });
          await tx.photoVariant.createMany({
            data: objects.map((o) => ({ photoId, version, width: o.v.width, height: o.v.height, mime: o.v.mime, bytes: o.v.bytes, storageKey: o.key })),
          });
          if (this.deps.faults.has("db-commit")) throw new Error("[FAULT_INJECTION db-commit] Giả lập DB lỗi trước khi commit version mới");
          return tx.photo.findUniqueOrThrow({ where: { id: photoId }, include: photoInclude });
        });
      } catch (err) {
        // Transaction đã rollback nhưng không hoàn tác được file: xóa bù các file của version mới
        const cleanup: CompensationResult = await this.deps.cleanup.compensate(photo.storage, keys, "EDIT_DB_WRITE_FAILED", photoId);
        if (err instanceof VersionRace) {
          const latest = await prisma.photo.findUnique({ where: { id: photoId }, select: { currentVersion: true, status: true } });
          if (!latest || latest.status === "DELETING") throw notFound("Ảnh đã bị xóa trong lúc chỉnh sửa");
          throw versionConflict(latest.currentVersion, input.baseVersion, cleanup);
        }
        log.error("Không lưu được version mới", { photoId, version, error: describeError(err) });
        throw new EditError(500, "DB_WRITE_FAILED", "Không lưu được version mới; các file vừa ghi đã được dọn, ảnh đang công bố không đổi", {
          reason: describeError(err),
          cleanup,
        });
      }

      return {
        status: 201,
        changed: true,
        version,
        photo: toPhotoDto(record, this.deps.urls, { admin: true }),
        supersededVersion: input.baseVersion,
        oldFilesDeleteAfter: new Date(now.getTime() + this.deps.versionRetentionMs).toISOString(),
      };
    });
  }

  /** Bản gốc chuẩn hóa thu nhỏ để trình chỉnh sửa trên browser xem trước (cùng origin, không cần CORS). */
  async preview(photoId: string, max: number): Promise<Buffer> {
    const photo = await this.deps.prisma.photo.findUnique({ where: { id: photoId }, select: { status: true, storage: true, originalKey: true } });
    if (!photo || photo.status === "DELETING") throw notFound("Ảnh không tồn tại");
    const storage = this.deps.storages.tryGet(photo.storage);
    if (!storage) throw new EditError(409, "STORAGE_UNAVAILABLE", `Kho "${photo.storage}" của ảnh không còn trong cấu hình`);
    return this.deps.semaphore.run(async () => previewOf(await readAll(storage, photo.originalKey), max, this.deps.upload.maxPixels));
  }
}

class VersionRace extends Error {}

function versionConflict(currentVersion: number, baseVersion: number, cleanup?: CompensationResult) {
  return new EditError(409, "VERSION_CONFLICT", `Ảnh vừa được lưu thành v${currentVersion} trong lúc bạn sửa v${baseVersion}; tải lại rồi sửa tiếp`, {
    currentVersion,
    baseVersion,
    ...(cleanup ? { cleanup } : {}),
  });
}

export function paramsOf(v: { cropX: number | null; cropY: number | null; cropWidth: number | null; cropHeight: number | null; rotate: number; flipH: boolean }): EditParams {
  const crop = v.cropX !== null && v.cropY !== null && v.cropWidth !== null && v.cropHeight !== null ? { x: v.cropX, y: v.cropY, width: v.cropWidth, height: v.cropHeight } : null;
  return { crop, rotate: v.rotate as EditParams["rotate"], flipH: v.flipH };
}

async function readAll(storage: StorageDriver, key: string): Promise<Buffer> {
  let obj;
  try {
    obj = await storage.get(key);
  } catch (err) {
    throw new EditError(502, "STORAGE_READ_FAILED", "Không đọc được bản gốc từ kho lưu trữ", { reason: describeError(err) });
  }
  if (!obj || obj === "not-modified") throw new EditError(409, "ORIGINAL_MISSING", "Bản gốc không còn trong kho, không chỉnh sửa được");
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of obj.body) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    total += buf.length;
    if (total > MAX_ORIGINAL_BYTES) {
      obj.body.destroy();
      throw new EditError(413, "ORIGINAL_TOO_LARGE", "Bản gốc quá lớn để chỉnh sửa");
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}
