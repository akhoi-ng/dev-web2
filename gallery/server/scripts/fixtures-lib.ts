import { randomBytes } from "node:crypto";
import sharp from "sharp";

/** Ảnh có chữ "TOP" ở mép trên: nhìn là biết ảnh có hiển thị đúng hướng hay không. */
function labelSvg(width: number, height: number, label: string, hue: number): Buffer {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="hsl(${hue},70%,55%)"/><stop offset="1" stop-color="hsl(${(hue + 60) % 360},70%,30%)"/>
  </linearGradient></defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
  <rect x="0" y="0" width="100%" height="${Math.round(height * 0.12)}" fill="rgba(255,255,255,0.85)"/>
  <text x="50%" y="${Math.round(height * 0.09)}" font-family="Arial, sans-serif" font-size="${Math.round(height * 0.07)}" font-weight="700" text-anchor="middle" fill="#111">TOP ↑</text>
  <text x="50%" y="55%" font-family="Arial, sans-serif" font-size="${Math.round(Math.min(width, height) * 0.08)}" text-anchor="middle" fill="#fff">${label}</text>
  <text x="50%" y="65%" font-family="Arial, sans-serif" font-size="${Math.round(Math.min(width, height) * 0.05)}" text-anchor="middle" fill="#fff">${width}×${height}</text>
</svg>`);
}

export async function makeJpeg(width: number, height: number, label = "JPEG", hue = 200): Promise<Buffer> {
  return sharp(labelSvg(width, height, label, hue)).jpeg({ quality: 90 }).toBuffer();
}

export async function makePng(width: number, height: number, label = "PNG", alpha = true): Promise<Buffer> {
  const base = sharp(labelSvg(width, height, label, 20));
  return (alpha ? base.ensureAlpha(0.85) : base).png().toBuffer();
}

/**
 * Ảnh chụp dọc từ điện thoại: pixels lưu NGANG, EXIF Orientation = 6 (cần xoay 90° theo chiều kim đồng
 * hồ để hiển thị) và có tọa độ GPS GIẢ (Hồ Gươm, Hà Nội). Sau khi chuẩn hóa phải thành ảnh dọc
 * 1200×1600, chữ TOP ở mép trên, không còn EXIF/GPS.
 */
export async function makeExifRotatedJpeg(): Promise<Buffer> {
  const upright = await sharp(labelSvg(1200, 1600, "EXIF 6 + GPS", 120)).png().toBuffer();
  return sharp(upright)
    .rotate(270) // lưu pixels nằm ngang (xoay ngược chiều kim đồng hồ 90°)
    .jpeg({ quality: 90 })
    .withExif({
      IFD0: { Make: "FakePhone", Model: "Gallery Test" },
      IFD3: {
        GPSLatitudeRef: "N",
        GPSLatitude: "21/1 1/1 4800/100",
        GPSLongitudeRef: "E",
        GPSLongitude: "105/1 51/1 1200/100",
      },
    })
    // sharp tự quản lý tag Orientation: phải đặt qua withMetadata, không qua withExif
    .withMetadata({ orientation: 6 })
    .toBuffer();
}

/** File text đổi đuôi thành .jpg */
export function makeFakeJpeg(): Buffer {
  return Buffer.from("Day khong phai la anh. This is a plain text file renamed to .jpg\n".repeat(20));
}

/** Ảnh có chữ ký đúng nhưng thiếu bytes ở cuối */
export function truncate(buffer: Buffer, keepRatio = 0.6): Buffer {
  return buffer.subarray(0, Math.floor(buffer.length * keepRatio));
}

/** PNG nhiễu ngẫu nhiên (nén kém) lớn hơn minBytes - vượt giới hạn dung lượng mỗi file */
export async function makeOversizePng(minBytes: number): Promise<Buffer> {
  // PNG nhiễu RGB ~3 bytes/pixel
  const side = Math.ceil(Math.sqrt(minBytes / 3) * 1.08);
  const raw = randomBytes(side * side * 3);
  const png = await sharp(raw, { raw: { width: side, height: side, channels: 3 } }).png({ compressionLevel: 0 }).toBuffer();
  if (png.length <= minBytes) throw new Error("PNG nhiễu nhỏ hơn mong đợi");
  return png;
}

/** File nhỏ nhưng khai báo rất nhiều pixel (8000×6000 = 48 triệu) - vượt giới hạn số pixel */
export async function makePixelBomb(width = 8000, height = 6000): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: "#336699" } }).png({ compressionLevel: 9 }).toBuffer();
}

/** Bytes rác có chữ ký JPEG, dùng để vượt tổng dung lượng request */
export function makeJunkJpeg(bytes: number): Buffer {
  const buf = randomBytes(bytes);
  buf[0] = 0xff;
  buf[1] = 0xd8;
  buf[2] = 0xff;
  return buf;
}
