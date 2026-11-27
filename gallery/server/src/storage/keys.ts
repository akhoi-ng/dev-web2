/**
 * Storage key do server tạo, không chứa dữ liệu người dùng:
 *   photos/<photoId>/original.<jpg|png>      bản gốc đã chuẩn hóa (xoay đúng hướng, bỏ EXIF)
 *   photos/<photoId>/v<version>/<width>.webp variant để công bố
 *   _healthcheck/<uuid>.txt                  file tạm của nút "Kiểm tra kết nối"
 *
 * Cùng một key dùng được cho local filesystem lẫn bucket S3, nên chuyển kho chỉ là chép nguyên cây thư
 * mục sang bucket (hoặc ngược lại) mà không sửa DB.
 */
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const KEY_PATTERN = new RegExp(`^(photos/${UUID}/(original\\.(jpg|png)|v[1-9][0-9]{0,3}/[1-9][0-9]{1,4}\\.webp)|_healthcheck/${UUID}\\.txt)$`);
const MEDIA_PATTERN = new RegExp(`^photos/${UUID}/v[1-9][0-9]{0,3}/[1-9][0-9]{1,4}\\.webp$`);

export function variantKey(photoId: string, version: number, width: number): string {
  return assertKey(`photos/${photoId}/v${version}/${width}.webp`);
}

export function originalKey(photoId: string, ext: "jpg" | "png"): string {
  return assertKey(`photos/${photoId}/original.${ext}`);
}

export function healthcheckKey(id: string): string {
  return assertKey(`_healthcheck/${id}.txt`);
}

export function isValidKey(key: string): boolean {
  return KEY_PATTERN.test(key);
}

/** Chỉ variant WebP mới được phục vụ qua /media; bản gốc đi qua endpoint tải xuống có kiểm tra quyền. */
export function isMediaKey(key: string): boolean {
  return MEDIA_PATTERN.test(key);
}

export function assertKey(key: string): string {
  if (!isValidKey(key)) throw new Error(`Storage key không hợp lệ: ${key}`);
  return key;
}

/** Ghép URL công khai từ tiền tố và key, mã hóa từng đoạn của key. */
export function joinUrl(base: string, key: string): string {
  return `${base.replace(/\/+$/, "")}/${key.split("/").map(encodeURIComponent).join("/")}`;
}
