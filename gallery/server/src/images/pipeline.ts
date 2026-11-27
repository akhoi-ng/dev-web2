import sharp, { type Metadata } from "sharp";
import { FileRejection } from "../errors.js";
import type { ImageFormat } from "./signature.js";

// Không giữ cache thao tác giữa các request: mỗi ảnh chỉ xử lý một lần
sharp.cache(false);

export interface VariantSpec {
  width: number;
  quality: number;
}

export interface NormalizedImage {
  buffer: Buffer;
  width: number;
  height: number;
  mime: "image/jpeg" | "image/png";
  ext: "jpg" | "png";
}

export interface GeneratedVariant {
  width: number;
  height: number;
  quality: number;
  buffer: Buffer;
  bytes: number;
  mime: "image/webp";
}

/**
 * Chọn chiều rộng variant: không phóng lớn và không tạo hai file trùng chiều rộng.
 *   ảnh 4000px -> 320, 960, 1600;  ảnh 800px -> 320, 800;  ảnh 300px -> 300
 */
export function planVariants(sourceWidth: number, specs: VariantSpec[]): VariantSpec[] {
  const out: VariantSpec[] = [];
  for (const spec of [...specs].sort((a, b) => a.width - b.width)) {
    const width = Math.min(spec.width, sourceWidth);
    if (out.some((v) => v.width === width)) continue;
    out.push({ width, quality: spec.quality });
    if (width === sourceWidth) break;
  }
  return out;
}

/**
 * Bước 1 - đọc HEADER, chưa giải mã pixel: xác nhận định dạng khớp chữ ký và số pixel dưới ngưỡng.
 * Một file nén vài KB vẫn có thể khai báo hàng trăm triệu pixel, nên phải chặn trước khi decoder cấp
 * phát bộ đệm cho toàn bộ ảnh. Phép nhân dùng BigInt để không tràn số.
 */
export async function inspectImage(input: string | Buffer, expected: ImageFormat, maxPixels: number) {
  let meta: Metadata;
  try {
    meta = await sharp(input, { limitInputPixels: false }).metadata();
  } catch (err) {
    throw new FileRejection("DECODE_FAILED", "Không đọc được header ảnh", { reason: (err as Error).message });
  }
  if (meta.format !== expected || !meta.width || !meta.height) {
    throw new FileRejection("UNSUPPORTED_TYPE", "Nội dung file không phải ảnh JPEG hoặc PNG hợp lệ", { detected: meta.format ?? null });
  }
  const pixels = BigInt(meta.width) * BigInt(meta.height);
  if (pixels > BigInt(maxPixels)) {
    throw new FileRejection("TOO_MANY_PIXELS", `Ảnh có ${pixels.toLocaleString("en-US")} pixel, vượt giới hạn ${maxPixels.toLocaleString("en-US")}`, {
      width: meta.width,
      height: meta.height,
      pixels: Number(pixels),
      maxPixels,
    });
  }
  return { width: meta.width, height: meta.height, orientation: meta.orientation ?? 1, hasExif: Boolean(meta.exif) };
}

/**
 * Bước 2 - giải mã toàn bộ và chuẩn hóa: xoay pixels theo EXIF orientation (.rotate() không tham số)
 * RỒI mới bỏ metadata. sharp mặc định không ghi EXIF/XMP/GPS vào file đầu ra và chuyển màu về sRGB.
 * failOn "warning" làm decoder từ chối file hỏng hoặc thiếu bytes ở cuối dù chữ ký ban đầu đúng.
 */
export async function normalizeImage(input: string | Buffer, format: ImageFormat, maxPixels: number): Promise<NormalizedImage> {
  try {
    const pipeline = sharp(input, { failOn: "warning", limitInputPixels: maxPixels }).rotate();
    const { data, info } =
      format === "png"
        ? await pipeline.png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer({ resolveWithObject: true })
        : await pipeline.jpeg({ quality: 92, chromaSubsampling: "4:4:4", mozjpeg: true }).toBuffer({ resolveWithObject: true });
    return {
      buffer: data,
      width: info.width,
      height: info.height,
      mime: format === "png" ? "image/png" : "image/jpeg",
      ext: format === "png" ? "png" : "jpg",
    };
  } catch (err) {
    const message = (err as Error).message;
    if (/pixel limit/i.test(message)) {
      throw new FileRejection("TOO_MANY_PIXELS", "Ảnh vượt giới hạn số pixel", { reason: message });
    }
    throw new FileRejection("DECODE_FAILED", "Ảnh hỏng hoặc thiếu dữ liệu, không giải mã được", { reason: message });
  }
}

/** Bước 3 - sinh các variant WebP từ bản đã chuẩn hóa (đã đúng hướng, không EXIF). */
export async function generateVariants(normalized: NormalizedImage, specs: VariantSpec[]): Promise<GeneratedVariant[]> {
  const plan = planVariants(normalized.width, specs);
  return Promise.all(
    plan.map(async (spec) => {
      const { data, info } = await sharp(normalized.buffer)
        .resize({ width: spec.width, withoutEnlargement: true })
        .webp({ quality: spec.quality, effort: 4, smartSubsample: true })
        .toBuffer({ resolveWithObject: true });
      return { width: info.width, height: info.height, quality: spec.quality, buffer: data, bytes: data.length, mime: "image/webp" as const };
    }),
  );
}

/** Ảnh 16px cho hiệu ứng blur-up khi lưới ảnh đang tải (khoảng 100-300 bytes). */
export async function blurPlaceholder(normalized: NormalizedImage): Promise<string> {
  const data = await sharp(normalized.buffer).resize({ width: 16, withoutEnlargement: true }).webp({ quality: 40 }).toBuffer();
  return `data:image/webp;base64,${data.toString("base64")}`;
}
