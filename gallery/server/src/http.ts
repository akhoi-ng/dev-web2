import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { HttpError, badRequest, notFound } from "./errors.js";
import { log } from "./log.js";

export function parseWith<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw badRequest(
      "VALIDATION_ERROR",
      "Dữ liệu không hợp lệ",
      result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    );
  }
  return result.data;
}

const Uuid = z.uuid();

/** id trên URL phải là UUID; sai định dạng coi như không tồn tại. */
export function uuidParam(value: string | string[] | undefined): string {
  const v = Array.isArray(value) ? value[0] : value;
  if (!v || !Uuid.safeParse(v).success) throw notFound();
  return v;
}

export function notFoundHandler(req: Request, _res: Response, next: NextFunction) {
  next(new HttpError(404, "ROUTE_NOT_FOUND", `Không có route ${req.method} ${req.path}`));
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (res.headersSent) {
    res.end();
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, ...(err.details !== undefined ? { details: err.details } : {}) } });
    return;
  }
  const e = err as { type?: string; status?: number; message?: string };
  if (e?.type === "entity.too.large") {
    res.status(413).json({ error: { code: "PAYLOAD_TOO_LARGE", message: "Body JSON quá lớn" } });
    return;
  }
  if (e?.type === "entity.parse.failed") {
    res.status(400).json({ error: { code: "INVALID_JSON", message: "Body không phải JSON hợp lệ" } });
    return;
  }
  log.error("Lỗi không xử lý", { method: req.method, path: req.path, error: err });
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Lỗi máy chủ" } });
}
