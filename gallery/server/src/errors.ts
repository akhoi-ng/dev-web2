/** Lỗi có mã HTTP và mã lỗi ổn định để client xử lý. */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (code: string, message: string, details?: unknown) => new HttpError(400, code, message, details);
export const unauthorized = (message = "Cần đăng nhập") => new HttpError(401, "UNAUTHORIZED", message);
export const forbidden = (message = "Không có quyền") => new HttpError(403, "FORBIDDEN", message);
export const notFound = (message = "Không tìm thấy") => new HttpError(404, "NOT_FOUND", message);
export const conflict = (code: string, message: string) => new HttpError(409, code, message);

/** Lỗi của MỘT file trong request upload: chỉ từ chối file đó, các file khác vẫn được xử lý. */
export class FileRejection extends Error {
  constructor(
    public readonly code: FileErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export type FileErrorCode =
  | "EMPTY_FILE"
  | "FILE_TOO_LARGE"
  | "UNSUPPORTED_TYPE"
  | "TOO_MANY_PIXELS"
  | "DECODE_FAILED"
  | "STORAGE_WRITE_FAILED"
  | "DB_WRITE_FAILED"
  | "INTERNAL_ERROR";
