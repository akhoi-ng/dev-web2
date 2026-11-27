import { Router } from "express";
import { pipeline } from "node:stream/promises";
import type { AppContext } from "../context.js";
import { isMediaKey } from "../storage/keys.js";
import { IMMUTABLE_CACHE } from "../upload/service.js";

/**
 * GET /media/<storage key> - web server là origin của file ảnh.
 *   Ảnh công khai: Cache-Control: public, max-age=31536000, immutable (key chứa version nên nội dung
 *   của một URL không bao giờ đổi; khi chỉnh sửa ảnh sẽ có URL mới).
 *   Ảnh ẩn: chỉ admin đã đăng nhập xem được, Cache-Control: private, no-store (không cho cache dùng chung).
 */
export function mediaRouter(ctx: AppContext): Router {
  const { prisma, storages, sessions } = ctx;
  const router = Router();

  router.get("/*key", async (req, res) => {
    const segments = (req.params as { key?: string[] }).key ?? [];
    const key = segments.join("/");
    const notFound = () => res.status(404).set("Cache-Control", "no-cache").type("text/plain").send("Not found");
    if (!isMediaKey(key)) return notFound();

    const variant = await prisma.photoVariant.findUnique({
      where: { storageKey: key },
      select: { mime: true, photo: { select: { status: true, storage: true } } },
    });
    if (!variant || variant.photo.status === "DELETING") return notFound();
    // Đọc từ kho chứa ảnh (ảnh có thể nằm ở kho khác kho mặc định)
    const storage = storages.tryGet(variant.photo.storage);
    if (!storage) return notFound();
    const isPublic = variant.photo.status === "PUBLISHED";
    if (!isPublic && !(await sessions.resolve(req))) return notFound();

    const headers = {
      "Content-Type": variant.mime,
      "Cache-Control": isPublic ? IMMUTABLE_CACHE : "private, no-store",
      "X-Content-Type-Options": "nosniff",
      // Cho phép trang ở origin khác (CDN, domain riêng) nhúng ảnh
      "Cross-Origin-Resource-Policy": "cross-origin",
    };

    if (storage.localPath) {
      res.sendFile(storage.localPath(key), { headers, cacheControl: false, dotfiles: "deny" }, (err) => {
        if (err && !res.headersSent) notFound();
      });
      return;
    }

    const ifNoneMatch = req.get("if-none-match");
    const obj = await storage.get(key, ifNoneMatch ? { ifNoneMatch } : undefined);
    if (obj === "not-modified") {
      res.status(304).set(headers).end();
      return;
    }
    if (!obj) return notFound();
    res.set(headers);
    if (obj.contentLength !== undefined) res.set("Content-Length", String(obj.contentLength));
    if (obj.etag) res.set("ETag", obj.etag);
    if (obj.lastModified) res.set("Last-Modified", obj.lastModified.toUTCString());
    if (req.method === "HEAD") {
      obj.body.destroy();
      res.end();
      return;
    }
    await pipeline(obj.body, res);
  });

  return router;
}
