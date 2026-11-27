import type { Readable } from "node:stream";

export interface PutOptions {
  contentType: string;
  cacheControl?: string;
  contentDisposition?: string;
}

export interface StoredObject {
  body: Readable;
  contentType?: string;
  contentLength?: number;
  etag?: string;
  lastModified?: Date;
}

export interface ObjectInfo {
  key: string;
  bytes: number;
}

export interface TestStep {
  step: string;
  ok: boolean;
  ms: number;
  detail?: string;
  /** Bước không bắt buộc (ví dụ đọc qua URL công khai): lỗi chỉ là cảnh báo */
  optional?: boolean;
}

/**
 * Hợp đồng chung của nơi lưu ảnh. Ứng dụng chọn MỘT driver khi khởi động (STORAGE_DRIVER) và không
 * tự chuyển sang driver khác khi lỗi, để file không nằm rải rác ở hai kho.
 */
export interface StorageDriver {
  readonly kind: "local" | "s3";
  /** Mô tả an toàn để hiển thị trong Admin (không có secret) */
  describe(): Record<string, string | boolean | null>;
  put(key: string, body: Buffer, options: PutOptions): Promise<void>;
  /** null khi không có object; "not-modified" khi ETag khớp If-None-Match */
  get(key: string, options?: { ifNoneMatch?: string }): Promise<StoredObject | "not-modified" | null>;
  /** Xóa idempotent: key không tồn tại vẫn coi là thành công */
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  list(prefix: string): AsyncIterable<ObjectInfo>;
  /** URL công khai trực tiếp (CDN/bucket public) hoặc null nếu web server phục vụ qua /media */
  directPublicUrl(key: string): string | null;
  /** Đường dẫn file trên đĩa (chỉ driver local) để dùng res.sendFile */
  localPath?(key: string): string;
  /** URL tải xuống có chữ ký, hết hạn sau expiresIn giây (chỉ driver S3) */
  presignDownload?(key: string, filename: string, expiresIn: number): Promise<string>;
  /** Ghi, đọc, xóa thử một object để kiểm tra kết nối và quyền */
  test(): Promise<TestStep[]>;
}
