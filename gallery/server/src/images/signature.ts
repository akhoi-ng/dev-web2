export type ImageFormat = "jpeg" | "png";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Nhận dạng định dạng theo chữ ký (magic bytes) ở đầu file. Phần mở rộng và MIME do browser khai báo
 * không được tin. Chỉ chấp nhận JPEG (FF D8 FF) và PNG (89 50 4E 47 0D 0A 1A 0A).
 */
export function detectSignature(head: Buffer): ImageFormat | null {
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "jpeg";
  if (head.length >= PNG.length && head.subarray(0, PNG.length).equals(PNG)) return "png";
  return null;
}

export const SIGNATURE_BYTES = PNG.length;
