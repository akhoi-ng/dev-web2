import { ApiError, type FileResult, type UploadResponse } from "./api";

export type ServerStage = "validating" | "processing" | "storing" | "saving";

export type UploadEvent =
  | { type: "upload-progress"; loaded: number; total: number }
  | { type: "received"; files: { index: number; filename: string; bytes: number }[] }
  | { type: "stage"; index: number; stage: ServerStage }
  | { type: "file"; result: FileResult };

export interface UploadItemMeta {
  title?: string;
  altText?: string;
  description?: string;
}

/**
 * Gửi 1-5 ảnh và trường mô tả trong MỘT request multipart (trường file tên "photos").
 * Dùng XMLHttpRequest vì fetch chưa báo tiến trình gửi body. Server trả từng bước xử lý dạng
 * NDJSON (Accept: application/x-ndjson) để vẽ thanh tiến trình theo từng file.
 */
export function uploadBatch(
  files: File[],
  fields: { items: UploadItemMeta[]; albumId?: string; tags?: string; storage?: string },
  onEvent: (e: UploadEvent) => void,
  signal?: AbortSignal,
): Promise<UploadResponse> {
  const form = new FormData();
  form.append("items", JSON.stringify(fields.items));
  if (fields.albumId) form.append("albumId", fields.albumId);
  if (fields.tags) form.append("tags", fields.tags);
  if (fields.storage) form.append("storage", fields.storage);
  // Trường text đặt trước file để server đọc được trước khi nhận bytes ảnh
  for (const file of files) form.append("photos", file, file.name);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/admin/photos");
    xhr.setRequestHeader("Accept", "application/x-ndjson");
    xhr.setRequestHeader("X-Requested-With", "XMLHttpRequest");
    xhr.withCredentials = true;

    let consumed = 0;
    let final: UploadResponse | null = null;
    let streamError: ApiError | null = null;

    const drain = (flushAll: boolean) => {
      const text = xhr.responseText;
      if (!(xhr.getResponseHeader("Content-Type") ?? "").includes("ndjson")) return;
      let nl: number;
      while ((nl = text.indexOf("\n", consumed)) !== -1 || (flushAll && consumed < text.length)) {
        const end = nl === -1 ? text.length : nl;
        const line = text.slice(consumed, end).trim();
        consumed = end + 1;
        if (!line) continue;
        const msg = JSON.parse(line) as { type: string } & Record<string, unknown>;
        if (msg.type === "done") final = msg as unknown as UploadResponse;
        else if (msg.type === "error") {
          const e = msg.error as { code: string; message: string };
          streamError = new ApiError(500, e.code, e.message);
        } else onEvent(msg as unknown as UploadEvent);
      }
    };

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onEvent({ type: "upload-progress", loaded: e.loaded, total: e.total });
    };
    xhr.onprogress = () => drain(false);
    xhr.onload = () => {
      const isStream = (xhr.getResponseHeader("Content-Type") ?? "").includes("ndjson");
      if (isStream) {
        drain(true);
        if (final) return resolve(final);
        return reject(streamError ?? new ApiError(500, "STREAM_INCOMPLETE", "Máy chủ ngắt giữa chừng"));
      }
      // Lỗi cấp request (400, 401, 413, 415...) trả JSON thường
      let body: { error?: { code: string; message: string; details?: unknown } } | null = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* không phải JSON */
      }
      const err = body?.error;
      reject(new ApiError(xhr.status, err?.code ?? `HTTP_${xhr.status}`, err?.message ?? `Lỗi ${xhr.status}`, err?.details));
    };
    xhr.onerror = () => reject(new ApiError(0, "NETWORK_ERROR", "Mất kết nối khi đang tải lên (có thể request vượt giới hạn dung lượng)"));
    xhr.onabort = () => reject(new DOMException("Đã hủy", "AbortError"));
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(form);
  });
}

/**
 * Chia hàng đợi thành các lượt hợp lệ: tối đa maxFiles file và tổng dung lượng dưới maxRequestBytes
 * (trừ hao phần header multipart). File tự nó đã quá lớn được gửi riêng để server trả lỗi cho đúng file đó.
 */
export function planBatches<T extends { file: File }>(items: T[], maxFiles: number, maxRequestBytes: number): T[][] {
  const budget = maxRequestBytes - 512 * 1024;
  const batches: T[][] = [];
  let current: T[] = [];
  let size = 0;
  for (const item of items) {
    const bytes = item.file.size;
    if (bytes > budget) {
      batches.push([item]);
      continue;
    }
    if (current.length >= maxFiles || size + bytes > budget) {
      batches.push(current);
      current = [];
      size = 0;
    }
    current.push(item);
    size += bytes;
  }
  if (current.length) batches.push(current);
  return batches;
}
