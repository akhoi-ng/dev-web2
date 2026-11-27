import type { Request } from "express";
import busboy from "busboy";
import { HttpError, badRequest } from "../errors.js";
import { SIGNATURE_BYTES } from "../images/signature.js";
import { sanitizeFilename } from "../util/text.js";

export interface UploadLimits {
  maxFiles: number;
  maxFileBytes: number;
  maxRequestBytes: number;
}

export interface ReceivedFile {
  /** Thứ tự của file trong request (0, 1, 2...) để nối kết quả với đầu vào, kể cả khi trùng tên */
  index: number;
  filename: string;
  declaredMime: string;
  /** Số bytes đã nhận (dừng đếm khi vượt giới hạn) */
  bytes: number;
  /** File vượt UPLOAD_MAX_FILE_BYTES: phần đã nhận bị bỏ ngay, không giữ */
  oversize: boolean;
  head: Buffer;
  /**
   * Bytes của file, chỉ nằm trong bộ nhớ (không ghi ra đĩa). null khi file bị từ chối lúc nhận,
   * hoặc sau khi đã xử lý xong để giải phóng bộ nhớ.
   */
  data: Buffer | null;
}

export interface ParsedUpload {
  fields: Record<string, string>;
  files: ReceivedFile[];
  totalBytes: number;
}

export const FILE_FIELD = "photos";
const MAX_FIELDS = 20;
const MAX_FIELD_BYTES = 64 * 1024;

/**
 * Đọc multipart/form-data theo dạng stream. File được gom thẳng vào bộ nhớ, không ghi file tạm ra
 * đĩa: ảnh chỉ tồn tại trong RAM cho tới khi xử lý xong và được đẩy lên kho. Bộ nhớ dùng cho một
 * request bị chặn bởi các giới hạn bên dưới (mỗi file <= UPLOAD_MAX_FILE_BYTES, cả request <=
 * UPLOAD_MAX_REQUEST_BYTES); phần vượt ngưỡng bị bỏ ngay khi nhận.
 *
 * Lỗi cấp REQUEST (không công bố ảnh nào):
 *   - không phải multipart, sai cấu trúc, trường lạ          -> 400
 *   - 0 file hoặc nhiều hơn UPLOAD_MAX_FILES file             -> 400
 *   - tổng bytes của body vượt UPLOAD_MAX_REQUEST_BYTES       -> 413 (dừng nhận ngay khi vượt)
 * Lỗi cấp FILE (chỉ đánh dấu, request vẫn tiếp tục):
 *   - file vượt UPLOAD_MAX_FILE_BYTES                         -> oversize = true
 */
export async function parseMultipart(req: Request, limits: UploadLimits): Promise<ParsedUpload> {
  const contentType = req.headers["content-type"] ?? "";
  if (!/^multipart\/form-data/i.test(contentType)) {
    throw new HttpError(415, "NOT_MULTIPART", "Request phải là multipart/form-data");
  }
  const declaredLength = Number(req.headers["content-length"]);
  if (Number.isFinite(declaredLength) && declaredLength > limits.maxRequestBytes) {
    throw tooLarge(limits.maxRequestBytes, declaredLength);
  }

  const files: ReceivedFile[] = [];
  const fields: Record<string, string> = {};
  const receiving: Promise<void>[] = [];
  let totalBytes = 0;
  let failure: HttpError | null = null;

  const bb = busboy({
    headers: req.headers,
    // Tên file tiếng Việt: busboy mặc định giải mã latin1
    defParamCharset: "utf8",
    limits: {
      files: limits.maxFiles,
      fileSize: limits.maxFileBytes,
      fields: MAX_FIELDS,
      fieldSize: MAX_FIELD_BYTES,
      parts: limits.maxFiles + MAX_FIELDS,
    },
  });

  return new Promise<ParsedUpload>((resolve, reject) => {
    let settled = false;

    const fail = (err: HttpError) => {
      if (settled) return;
      settled = true;
      failure = err;
      req.unpipe(bb);
      // Hủy parser (file stream đang nhận dở bị hủy theo) và bỏ mọi bytes đã gom
      bb.destroy(new Error(err.code));
      for (const f of files) f.data = null;
      // Tiếp tục đọc và bỏ phần body còn lại để browser nhận được response lỗi thay vì lỗi kết nối
      req.resume();
      reject(err);
    };

    req.on("data", (chunk: Buffer) => {
      totalBytes += chunk.length;
      if (totalBytes > limits.maxRequestBytes && !failure) fail(tooLarge(limits.maxRequestBytes));
    });
    req.on("error", () => fail(badRequest("REQUEST_ABORTED", "Kết nối bị lỗi khi đang nhận request")));
    req.on("close", () => {
      if (!req.complete) fail(badRequest("REQUEST_ABORTED", "Client hủy request giữa chừng"));
    });

    bb.on("file", (name, stream, info) => {
      // bb.destroy() hủy file stream đang mở kèm lỗi; luôn có listener để lỗi đó không thành uncaught
      stream.on("error", () => {});
      if (failure) return stream.resume();
      if (name !== FILE_FIELD) {
        stream.resume();
        return fail(badRequest("UNEXPECTED_FIELD", `Trường file phải tên "${FILE_FIELD}", nhận được "${name}"`));
      }
      const file: ReceivedFile = {
        index: files.length,
        filename: sanitizeFilename(info.filename),
        declaredMime: info.mimeType,
        bytes: 0,
        oversize: false,
        head: Buffer.alloc(0),
        data: null,
      };
      files.push(file);

      const chunks: Buffer[] = [];
      receiving.push(
        new Promise<void>((done) => {
          stream.on("data", (chunk: Buffer) => {
            file.bytes += chunk.length;
            if (file.head.length < SIGNATURE_BYTES) {
              file.head = Buffer.concat([file.head, chunk.subarray(0, SIGNATURE_BYTES - file.head.length)]);
            }
            if (!file.oversize) chunks.push(chunk);
          });
          // busboy cắt file ở UPLOAD_MAX_FILE_BYTES: bỏ phần đã gom, chỉ giữ số bytes để báo lỗi
          stream.on("limit", () => {
            file.oversize = true;
            chunks.length = 0;
          });
          stream.on("end", () => {
            if (!file.oversize && !failure) file.data = Buffer.concat(chunks);
            chunks.length = 0;
            done();
          });
          stream.on("close", () => done());
        }),
      );
    });

    bb.on("field", (name, value, info) => {
      if (info.valueTruncated) return fail(badRequest("FIELD_TOO_LARGE", `Trường "${name}" vượt ${MAX_FIELD_BYTES} bytes`));
      fields[name] = value;
    });
    bb.on("filesLimit", () => fail(badRequest("TOO_MANY_FILES", `Mỗi request tối đa ${limits.maxFiles} ảnh`, { maxFiles: limits.maxFiles })));
    bb.on("fieldsLimit", () => fail(badRequest("TOO_MANY_FIELDS", `Tối đa ${MAX_FIELDS} trường text`)));
    bb.on("partsLimit", () => fail(badRequest("TOO_MANY_PARTS", "Request có quá nhiều phần")));
    bb.on("error", (err: Error) => fail(badRequest("MALFORMED_MULTIPART", `Multipart sai cấu trúc: ${err.message}`)));
    bb.on("close", async () => {
      if (failure || settled) return;
      await Promise.all(receiving);
      if (failure || settled) return;
      if (files.length === 0) return fail(badRequest("NO_FILES", `Cần ít nhất 1 ảnh trong trường "${FILE_FIELD}"`));
      settled = true;
      resolve({ fields, files, totalBytes });
    });

    req.pipe(bb);
  });
}

function tooLarge(limit: number, received?: number) {
  return new HttpError(413, "PAYLOAD_TOO_LARGE", `Tổng dung lượng request vượt ${Math.round(limit / 1024 / 1024)} MiB`, {
    maxRequestBytes: limit,
    ...(received ? { contentLength: received } : {}),
  });
}
