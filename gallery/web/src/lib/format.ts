const bytesFmt = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 });

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${bytesFmt.format(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${bytesFmt.format(bytes / 1024 / 1024)} MB`;
  return `${bytesFmt.format(bytes / 1024 / 1024 / 1024)} GB`;
}

const dateFmt = new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" });
const dayFmt = new Intl.DateTimeFormat("vi-VN", { dateStyle: "long" });

export const formatDateTime = (iso: string) => dateFmt.format(new Date(iso));
export const formatDate = (iso: string) => dayFmt.format(new Date(iso));

/** Phần trăm tiết kiệm của variant so với file gốc người dùng tải lên. */
export function savedPercent(variantBytes: number, sourceBytes: number): number {
  if (sourceBytes <= 0) return 0;
  return Math.max(0, Math.round((1 - variantBytes / sourceBytes) * 1000) / 10);
}

export const numberFmt = new Intl.NumberFormat("vi-VN");

/** Variant gần chiều rộng mong muốn nhất (ưu tiên variant lớn hơn hoặc bằng). */
export function pickVariant<T extends { width: number }>(variants: T[], target: number): T | undefined {
  return variants.find((v) => v.width >= target) ?? variants.at(-1);
}

export const ERROR_LABELS: Record<string, string> = {
  EMPTY_FILE: "File rỗng",
  FILE_TOO_LARGE: "Vượt giới hạn dung lượng",
  UNSUPPORTED_TYPE: "Không phải JPEG/PNG",
  TOO_MANY_PIXELS: "Quá nhiều pixel",
  DECODE_FAILED: "Ảnh hỏng",
  STORAGE_WRITE_FAILED: "Lỗi ghi kho",
  DB_WRITE_FAILED: "Lỗi lưu metadata",
  INTERNAL_ERROR: "Lỗi máy chủ",
  PAYLOAD_TOO_LARGE: "Request quá lớn",
  TOO_MANY_FILES: "Quá số file",
};
