import { Router } from "express";
import { pipeline } from "node:stream/promises";
import type { AppContext } from "../context.js";
import { notFound } from "../errors.js";
import { parseWith, uuidParam } from "../http.js";
import { ListQuerySchema, listAlbums, listPhotos, listTags } from "../photos/queries.js";
import { photoInclude, toPhotoDto } from "../photos/serialize.js";
import { contentDisposition, slugify } from "../util/text.js";

export function publicRouter(ctx: AppContext): Router {
  const { prisma, storages, urls, sessions } = ctx;
  const router = Router();

  router.get("/photos", async (req, res) => {
    const query = parseWith(ListQuerySchema.omit({ status: true }), req.query);
    res.set("Cache-Control", "no-cache");
    res.json(await listPhotos(prisma, urls, query, { admin: false }));
  });

  router.get("/photos/:id", sessions.optional, async (req, res) => {
    const id = uuidParam(req.params.id);
    const photo = await prisma.photo.findUnique({ where: { id }, include: photoInclude });
    // Ảnh ẩn chỉ admin xem được; ảnh đang xóa coi như không còn
    if (!photo || photo.status === "DELETING" || (photo.status !== "PUBLISHED" && !req.user)) throw notFound("Ảnh không tồn tại");
    res.set("Cache-Control", "no-cache");
    res.json(toPhotoDto(photo, urls, { admin: Boolean(req.user) }));
  });

  /** Tải bản gốc đã chuẩn hóa (đúng hướng, không EXIF/GPS) với Content-Disposition: attachment. */
  router.get("/photos/:id/download", sessions.optional, async (req, res) => {
    const id = uuidParam(req.params.id);
    const photo = await prisma.photo.findUnique({ where: { id } });
    if (!photo || photo.status === "DELETING" || (photo.status !== "PUBLISHED" && !req.user)) throw notFound("Ảnh không tồn tại");
    const ext = photo.originalMime === "image/png" ? "png" : "jpg";
    const filename = `${slugify(photo.title) || "photo"}-${photo.id.slice(0, 8)}.${ext}`;
    // File nằm ở kho đã lưu ảnh, không phải kho mặc định hiện tại
    const storage = storages.tryGet(photo.storage);
    if (!storage) throw notFound(`Kho "${photo.storage}" của ảnh không còn được cấu hình`);

    if (storages.profile(photo.storage)?.downloadMode === "presigned" && storage.presignDownload) {
      res.set("Cache-Control", "no-store");
      res.redirect(302, await storage.presignDownload(photo.originalKey, filename, 300));
      return;
    }
    res.set({
      "Content-Disposition": contentDisposition("attachment", filename),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    });
    if (storage.localPath) {
      res.sendFile(storage.localPath(photo.originalKey), { headers: { "Content-Type": photo.originalMime }, cacheControl: false, lastModified: false, etag: false }, (err) => {
        if (err && !res.headersSent) res.status(404).json({ error: { code: "FILE_MISSING", message: "File gốc không còn trong kho" } });
      });
      return;
    }
    const obj = await storage.get(photo.originalKey);
    if (!obj || obj === "not-modified") throw notFound("File gốc không còn trong kho");
    res.set("Content-Type", photo.originalMime);
    if (obj.contentLength !== undefined) res.set("Content-Length", String(obj.contentLength));
    await pipeline(obj.body, res);
  });

  router.get("/albums", async (_req, res) => {
    res.set("Cache-Control", "no-cache");
    res.json(await listAlbums(prisma, urls, { admin: false }));
  });

  router.get("/tags", async (_req, res) => {
    res.set("Cache-Control", "no-cache");
    res.json(await listTags(prisma));
  });

  return router;
}
