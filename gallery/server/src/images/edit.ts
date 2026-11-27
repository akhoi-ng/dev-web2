import sharp from "sharp";
import type { NormalizedImage } from "./pipeline.js";

/** Cạnh nhỏ nhất của ảnh sau khi cắt (cũng là chiều rộng nhỏ nhất của variant và ảnh blur 16px). */
export const MIN_EDGE = 16;
export const ROTATIONS = [0, 90, 180, 270] as const;
export type Rotation = (typeof ROTATIONS)[number];

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Thông số chỉnh sửa, luôn tính từ BẢN GỐC ĐÃ CHUẨN HÓA (không từ variant WebP), áp dụng theo thứ tự:
 *   1. cắt vùng `crop` (tọa độ pixel của bản gốc)  2. xoay `rotate` độ theo chiều kim đồng hồ
 *   3. lật ngang nếu `flipH`
 * Browser gửi đầy đủ trạng thái này mỗi lần lưu, không gửi riêng thao tác vừa làm.
 */
export interface EditParams {
  crop: CropRect | null;
  rotate: Rotation;
  flipH: boolean;
}

export const IDENTITY_EDIT: EditParams = { crop: null, rotate: 0, flipH: false };

export class EditValidationError extends Error {
  constructor(
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

/**
 * Kiểm tra thông số với kích thước bản gốc. Vùng cắt phải nằm trọn trong ảnh: server từ chối thay vì
 * tự co lại vùng sai rồi công bố kết quả khác với thứ người dùng đã xem trước. Vùng cắt phủ toàn ảnh
 * được coi là không cắt.
 */
export function normalizeEditParams(params: EditParams, source: { width: number; height: number }): EditParams {
  if (!ROTATIONS.includes(params.rotate)) {
    throw new EditValidationError("Góc xoay chỉ nhận 0, 90, 180 hoặc 270 độ", { rotate: params.rotate });
  }
  const crop = params.crop;
  if (crop) {
    const ints = [crop.x, crop.y, crop.width, crop.height].every(Number.isInteger);
    const inside = crop.x >= 0 && crop.y >= 0 && crop.x + crop.width <= source.width && crop.y + crop.height <= source.height;
    if (!ints || !inside || crop.width < 1 || crop.height < 1) {
      throw new EditValidationError(`Vùng cắt phải là số nguyên và nằm trong ảnh gốc ${source.width}x${source.height}`, { crop, source });
    }
    if (crop.width < MIN_EDGE || crop.height < MIN_EDGE) {
      throw new EditValidationError(`Vùng cắt phải rộng và cao ít nhất ${MIN_EDGE}px`, { crop });
    }
  }
  const full = !crop || (crop.x === 0 && crop.y === 0 && crop.width === source.width && crop.height === source.height);
  return { crop: full ? null : { ...crop! }, rotate: params.rotate, flipH: Boolean(params.flipH) };
}

export function sameEdit(a: EditParams, b: EditParams): boolean {
  const ca = a.crop;
  const cb = b.crop;
  const sameCrop = ca === null || cb === null ? ca === cb : ca.x === cb.x && ca.y === cb.y && ca.width === cb.width && ca.height === cb.height;
  return sameCrop && a.rotate === b.rotate && a.flipH === b.flipH;
}

/** Kích thước ảnh sau chỉnh sửa. */
export function editedSize(params: EditParams, source: { width: number; height: number }): { width: number; height: number } {
  const w = params.crop?.width ?? source.width;
  const h = params.crop?.height ?? source.height;
  return params.rotate === 90 || params.rotate === 270 ? { width: h, height: w } : { width: w, height: h };
}

/**
 * Áp thông số lên bản gốc đã chuẩn hóa, trả ảnh cùng định dạng với bản gốc (JPEG/PNG) để
 * generateVariants() sinh WebP như lúc upload. Đầu ra không mang EXIF.
 *
 * sharp luôn chạy extract -> flop -> rotate dù gọi theo thứ tự nào. Thứ tự của mình là
 * cắt -> xoay θ -> lật, mà lật∘xoay(θ) = xoay(-θ)∘lật, nên khi có lật ta xoay góc 360-θ.
 * (test/edit.test.ts kiểm cả 8 tổ hợp xoay/lật.)
 */
export async function renderEdit(original: Buffer, params: EditParams, maxPixels: number): Promise<NormalizedImage> {
  let pipeline = sharp(original, { failOn: "warning", limitInputPixels: maxPixels });
  const meta = await pipeline.metadata();
  const isPng = meta.format === "png";
  if (params.crop) pipeline = pipeline.extract({ left: params.crop.x, top: params.crop.y, width: params.crop.width, height: params.crop.height });
  if (params.flipH) pipeline = pipeline.flop();
  const angle = params.flipH ? (360 - params.rotate) % 360 : params.rotate;
  if (angle !== 0) pipeline = pipeline.rotate(angle);
  // Bản trung gian chỉ để sinh variant: PNG nén nhẹ (nhanh, không mất dữ liệu), JPEG chất lượng cao
  const { data, info } = await (isPng ? pipeline.png({ compressionLevel: 1 }) : pipeline.jpeg({ quality: 95, chromaSubsampling: "4:4:4" })).toBuffer({
    resolveWithObject: true,
  });
  return {
    buffer: data,
    width: info.width,
    height: info.height,
    mime: isPng ? "image/png" : "image/jpeg",
    ext: isPng ? "png" : "jpg",
  };
}

/** Bản xem trước cho trình chỉnh sửa: bản gốc thu nhỏ vừa khung `max`px, WebP. */
export async function previewOf(original: Buffer, max: number, maxPixels: number): Promise<Buffer> {
  return sharp(original, { limitInputPixels: maxPixels }).resize({ width: max, height: max, fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
}
