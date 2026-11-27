import { Router } from "express";
import { z } from "zod";
import type { AppContext } from "../context.js";
import { HttpError, badRequest, conflict, notFound } from "../errors.js";
import { parseWith, uuidParam } from "../http.js";
import { log } from "../log.js";
import { deletePhotoFiles } from "../photos/cleanup.js";
import { EditRequestSchema } from "../photos/edit.js";
import { ListQuerySchema, listAlbums, listPhotos } from "../photos/queries.js";
import { photoInclude, toPhotoDto } from "../photos/serialize.js";
import { describeError } from "../storage/timed.js";
import { parseMultipart } from "../upload/multipart.js";
import { parseUploadMeta } from "../upload/service.js";
import { normalizeTags, slugify } from "../util/text.js";

const PhotoPatchSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    altText: z.string().trim().min(1).max(300).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    albumId: z.uuid().nullable().optional(),
    tags: z.union([z.array(z.string().max(60)).max(20), z.string().max(400)]).optional(),
    status: z.enum(["PUBLISHED", "HIDDEN"]).optional(),
  })
  .strict();

const AlbumSchema = z
  .object({
    title: z.string().trim().min(1).max(80),
    description: z.string().trim().max(500).nullable().optional(),
    slug: z.string().trim().max(60).optional(),
  })
  .strict();

export function adminRouter(ctx: AppContext): Router {
  const { prisma, storages, urls, uploads, edits, cleanup, config } = ctx;
  const storageChoices = () => ({
    defaultStorage: storages.defaultName,
    storages: storages.info().map((s) => ({ name: s.name, label: s.label, isDefault: s.isDefault })),
  });
  const router = Router();

  // ── Upload: 1-5 ảnh + trường mô tả trong MỘT request multipart ──
  router.post("/photos", async (req, res) => {
    let upload;
    try {
      upload = await parseMultipart(req, { ...config.upload });
    } catch (err) {
      // Client khai báo body quá lớn (gấp 4 lần ngưỡng): trả 413 rồi đóng kết nối, không đọc tiếp
      const declared = Number(req.headers["content-length"]);
      if (err instanceof HttpError && err.status === 413 && declared > config.upload.maxRequestBytes * 4) res.set("Connection", "close");
      throw err;
    }
    // Ảnh chỉ nằm trong RAM (upload.files[].data): không có file tạm nào trên đĩa cần dọn
    const meta = parseUploadMeta(upload.fields);
    if (meta.albumId && !(await prisma.album.findUnique({ where: { id: meta.albumId }, select: { id: true } }))) {
      throw badRequest("ALBUM_NOT_FOUND", "Album không tồn tại");
    }

    // Accept: application/x-ndjson -> trả tiến trình từng file theo dòng (thanh tiến trình trong Admin)
    if (req.accepts(["application/json", "application/x-ndjson"]) === "application/x-ndjson") {
      res.status(200).set({ "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" });
      res.flushHeaders();
      const write = (obj: unknown) => res.write(JSON.stringify(obj) + "\n");
      write({ type: "received", files: upload.files.map((f) => ({ index: f.index, filename: f.filename, bytes: f.bytes })) });
      try {
        const result = await uploads.handle(upload, meta, req.user!.id, write);
        write({ type: "done", ...result });
      } catch (err) {
        log.error("Lỗi khi xử lý upload dạng stream", { error: describeError(err) });
        write({ type: "error", error: err instanceof HttpError ? { code: err.code, message: err.message } : { code: "INTERNAL_ERROR", message: "Lỗi máy chủ" } });
      }
      res.end();
      return;
    }

    const result = await uploads.handle(upload, meta, req.user!.id);
    res.status(result.status).json(result);
  });

  router.get("/upload-limits", (_req, res) => {
    res.json({ ...uploads.limits, variants: config.upload.variants, ...storageChoices() });
  });

  // ── Thư viện ảnh ──
  router.get("/photos", async (req, res) => {
    const query = parseWith(ListQuerySchema, req.query);
    res.set("Cache-Control", "no-store");
    res.json(await listPhotos(prisma, urls, query, { admin: true }));
  });

  router.get("/photos/:id", async (req, res) => {
    const photo = await prisma.photo.findUnique({ where: { id: uuidParam(req.params.id) }, include: photoInclude });
    if (!photo) throw notFound("Ảnh không tồn tại");
    res.set("Cache-Control", "no-store");
    res.json(toPhotoDto(photo, urls, { admin: true }));
  });

  router.patch("/photos/:id", async (req, res) => {
    const id = uuidParam(req.params.id);
    const body = parseWith(PhotoPatchSchema, req.body);
    const photo = await prisma.photo.findUnique({ where: { id }, select: { status: true } });
    if (!photo) throw notFound("Ảnh không tồn tại");
    if (photo.status === "DELETING") throw conflict("PHOTO_DELETING", "Ảnh đang được xóa");
    if (body.albumId && !(await prisma.album.findUnique({ where: { id: body.albumId }, select: { id: true } }))) {
      throw badRequest("ALBUM_NOT_FOUND", "Album không tồn tại");
    }
    const updated = await prisma.photo.update({
      where: { id },
      data: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.altText !== undefined ? { altText: body.altText } : {}),
        ...(body.description !== undefined ? { description: body.description || null } : {}),
        ...(body.albumId !== undefined ? { albumId: body.albumId } : {}),
        ...(body.tags !== undefined ? { tags: normalizeTags(body.tags) } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
      },
      include: photoInclude,
    });
    res.json(toPhotoDto(updated, urls, { admin: true }));
  });

  // ── Chỉnh sửa ảnh (bonus): cắt, xoay, lật, khôi phục -> version mới ──
  /**
   * Body JSON: { baseVersion, crop: {x,y,width,height} | null, rotate: 0|90|180|270, flipH }
   *        hoặc { baseVersion, restore: true }
   * 201: đã công bố version mới; 200: thông số trùng version hiện tại (không tạo version);
   * 409 VERSION_CONFLICT: có lần lưu khác trước; 422 INVALID_EDIT: thông số sai, ảnh không đổi.
   */
  router.post("/photos/:id/edit", async (req, res) => {
    const id = uuidParam(req.params.id);
    const body = parseWith(EditRequestSchema, req.body);
    const result = await edits.edit(id, body);
    res.status(result.status).json(result);
  });

  // Bản gốc chuẩn hóa thu nhỏ cho khung xem trước của trình chỉnh sửa
  router.get("/photos/:id/source", async (req, res) => {
    const id = uuidParam(req.params.id);
    const max = Math.min(Math.max(Number(req.query.max) || 1600, 200), 2400);
    const body = await edits.preview(id, max);
    res.set({ "Content-Type": "image/webp", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" }).send(body);
  });

  /**
   * Xóa ảnh theo ba bước:
   *   1. Ẩn: đánh dấu DELETING, gallery và /media ngừng phục vụ ngay
   *   2. Dọn file: xóa mọi variant và bản gốc trong kho
   *   3. Hoàn tất: xóa metadata. Nếu bước 2 lỗi, bản ghi giữ trạng thái DELETING cùng danh sách key
   *      để tác vụ dọn chạy lại (202).
   */
  router.delete("/photos/:id", async (req, res) => {
    const id = uuidParam(req.params.id);
    const photo = await prisma.photo.findUnique({ where: { id }, include: { variants: true } });
    if (!photo) throw notFound("Ảnh không tồn tại");

    await prisma.photo.update({ where: { id }, data: { status: "DELETING", deleteRequestedAt: new Date() } });
    const outcome = await deletePhotoFiles(storages, photo);
    if (outcome.failed.length > 0) {
      log.warn("Xóa file của ảnh chưa xong, giữ bản ghi DELETING để dọn lại", { photoId: id, failed: outcome.failed });
      res.status(202).json({
        status: "DELETING",
        message: "Ảnh đã ẩn khỏi gallery nhưng chưa dọn hết file; tác vụ dọn sẽ thử lại",
        deletedKeys: outcome.deleted,
        pendingKeys: outcome.failed,
      });
      return;
    }
    await prisma.photo.deleteMany({ where: { id } });
    res.json({ status: "DELETED", deletedKeys: outcome.deleted });
  });

  // ── Album ──
  router.get("/albums", async (_req, res) => {
    res.set("Cache-Control", "no-store");
    res.json(await listAlbums(prisma, urls, { admin: true }));
  });

  const uniqueSlug = async (wanted: string, excludeId?: string) => {
    const base = slugify(wanted) || "album";
    for (let i = 1; i < 100; i++) {
      const slug = i === 1 ? base : `${base}-${i}`;
      const existing = await prisma.album.findUnique({ where: { slug }, select: { id: true } });
      if (!existing || existing.id === excludeId) return slug;
    }
    throw conflict("SLUG_TAKEN", "Không tạo được slug cho album");
  };

  router.post("/albums", async (req, res) => {
    const body = parseWith(AlbumSchema, req.body);
    const album = await prisma.album.create({
      data: { title: body.title, description: body.description || null, slug: await uniqueSlug(body.slug || body.title) },
    });
    res.status(201).json(album);
  });

  router.patch("/albums/:id", async (req, res) => {
    const id = uuidParam(req.params.id);
    const body = parseWith(AlbumSchema.partial(), req.body);
    if (!(await prisma.album.findUnique({ where: { id }, select: { id: true } }))) throw notFound("Album không tồn tại");
    const album = await prisma.album.update({
      where: { id },
      data: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.description !== undefined ? { description: body.description || null } : {}),
        ...(body.slug ? { slug: await uniqueSlug(body.slug, id) } : {}),
      },
    });
    res.json(album);
  });

  router.delete("/albums/:id", async (req, res) => {
    const id = uuidParam(req.params.id);
    if (!(await prisma.album.findUnique({ where: { id }, select: { id: true } }))) throw notFound("Album không tồn tại");
    // Ảnh trong album không bị xóa, chỉ bỏ liên kết (onDelete: SetNull)
    await prisma.album.delete({ where: { id } });
    res.status(204).end();
  });

  // ── Lưu trữ, thống kê, dọn file ──
  router.get("/overview", async (_req, res) => {
    const [byStatus, byStorage, photoSums, variantGroups, pending] = await Promise.all([
      prisma.photo.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.photo.groupBy({ by: ["storage"], _count: { _all: true }, _sum: { sourceBytes: true }, where: { status: { not: "DELETING" } } }),
      prisma.photo.aggregate({ _sum: { sourceBytes: true, originalBytes: true }, where: { status: { not: "DELETING" } } }),
      prisma.photoVariant.groupBy({ by: ["width"], _sum: { bytes: true }, _count: { _all: true }, where: { photo: { status: { not: "DELETING" } } } }),
      cleanup.pendingCount(),
    ]);
    // Gom variant theo cấu hình (ảnh nhỏ có variant hẹp hơn cấu hình, ví dụ 800px thuộc nhóm 960)
    const specs = config.upload.variants;
    const buckets = specs.map((s) => ({ width: s.width, count: 0, bytes: 0 }));
    for (const g of variantGroups) {
      const bucket = buckets.find((b) => g.width <= b.width) ?? buckets.at(-1)!;
      bucket.count += g._count._all;
      bucket.bytes += g._sum.bytes ?? 0;
    }
    res.set("Cache-Control", "no-store");
    res.json({
      defaultStorage: storages.defaultName,
      storages: storages.info().map((s) => {
        const g = byStorage.find((b) => b.storage === s.name);
        return { ...s, photoCount: g?._count._all ?? 0, sourceBytes: g?._sum.sourceBytes ?? 0 };
      }),
      // Ảnh nằm ở kho không còn trong cấu hình (sẽ hiển thị lỗi): cần thêm lại kho hoặc chuyển file
      orphanStorages: byStorage.filter((b) => !storages.has(b.storage)).map((b) => ({ name: b.storage, photoCount: b._count._all })),
      mediaBaseUrl: config.mediaBaseUrl,
      faults: [...config.faults],
      limits: { ...uploads.limits, variants: specs },
      photos: Object.fromEntries(byStatus.map((s) => [s.status, s._count._all])),
      bytes: {
        source: photoSums._sum.sourceBytes ?? 0,
        original: photoSums._sum.originalBytes ?? 0,
        variants: buckets,
      },
      cleanup: pending,
    });
  });

  // POST /api/admin/storage/test?storage=<tên kho> (mặc định: kho mặc định)
  router.post("/storage/test", async (req, res) => {
    const name = typeof req.query.storage === "string" && req.query.storage ? req.query.storage : storages.defaultName;
    const driver = storages.tryGet(name);
    if (!driver) throw notFound(`Kho "${name}" không có trong cấu hình`);
    const steps = await driver.test();
    const ok = steps.every((s) => s.ok || s.optional);
    res.status(ok ? 200 : 502).json({ ok, storage: name, details: driver.describe(), steps });
  });

  router.post("/cleanup", async (_req, res) => {
    // Chạy tay từ Admin: hoàn tất cả ảnh vừa mới chuyển DELETING
    const summary = await cleanup.run({ deletingOlderThanMs: 0 });
    res.json({ summary, pending: await cleanup.pendingCount() });
  });

  return router;
}
