/**
 * Hình học của trình chỉnh sửa ảnh. Server áp thông số lên bản gốc theo thứ tự
 *   cắt (tọa độ pixel bản gốc) -> xoay θ theo chiều kim đồng hồ -> lật ngang.
 * Người dùng lại kéo vùng cắt trên ảnh ĐÃ xoay/lật. Vì xoay bội số 90° và lật giữ hình chữ nhật thẳng
 * trục, vùng chọn trên ảnh đã biến đổi luôn quy đổi được về một hình chữ nhật trên bản gốc:
 * cắt(gốc, R_gốc) rồi xoay/lật cho đúng kết quả bằng cắt(ảnh đã xoay/lật, R).
 *
 * "View" dưới đây là ảnh gốc sau khi xoay/lật, tính bằng pixel của bản gốc (chưa thu nhỏ để hiển thị).
 */
export type Rotation = 0 | 90 | 180 | 270;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface EditState {
  /** Vùng cắt theo pixel của bản gốc; null = không cắt */
  crop: Rect | null;
  rotate: Rotation;
  flipH: boolean;
}

/** Trùng với MIN_EDGE của server */
export const MIN_EDGE = 16;

export const IDENTITY: EditState = { crop: null, rotate: 0, flipH: false };

export function viewSize(w: number, h: number, rotate: Rotation): { width: number; height: number } {
  return rotate === 90 || rotate === 270 ? { width: h, height: w } : { width: w, height: h };
}

/** Điểm trên bản gốc (W x H) -> điểm trên view. */
function forward(x: number, y: number, W: number, H: number, rotate: Rotation, flipH: boolean): [number, number] {
  let p: [number, number];
  if (rotate === 90) p = [H - y, x];
  else if (rotate === 180) p = [W - x, H - y];
  else if (rotate === 270) p = [y, W - x];
  else p = [x, y];
  if (flipH) p[0] = viewSize(W, H, rotate).width - p[0];
  return p;
}

/** Điểm trên view -> điểm trên bản gốc (W x H). */
function inverse(x: number, y: number, W: number, H: number, rotate: Rotation, flipH: boolean): [number, number] {
  const vx = flipH ? viewSize(W, H, rotate).width - x : x;
  if (rotate === 90) return [y, H - vx];
  if (rotate === 180) return [W - vx, H - y];
  if (rotate === 270) return [W - y, vx];
  return [vx, y];
}

function rectFrom(a: [number, number], b: [number, number]): Rect {
  const x = Math.min(a[0], b[0]);
  const y = Math.min(a[1], b[1]);
  return { x, y, width: Math.abs(a[0] - b[0]), height: Math.abs(a[1] - b[1]) };
}

/** Vùng cắt trên bản gốc -> hình chữ nhật trên view để vẽ khung chọn. */
export function toView(crop: Rect, W: number, H: number, rotate: Rotation, flipH: boolean): Rect {
  return rectFrom(forward(crop.x, crop.y, W, H, rotate, flipH), forward(crop.x + crop.width, crop.y + crop.height, W, H, rotate, flipH));
}

/** Khung chọn trên view -> vùng cắt nguyên pixel trên bản gốc, kẹp trong ảnh. */
export function toOriginal(view: Rect, W: number, H: number, rotate: Rotation, flipH: boolean): Rect {
  const r = rectFrom(inverse(view.x, view.y, W, H, rotate, flipH), inverse(view.x + view.width, view.y + view.height, W, H, rotate, flipH));
  const left = clamp(Math.round(r.x), 0, W);
  const top = clamp(Math.round(r.y), 0, H);
  const right = clamp(Math.round(r.x + r.width), 0, W);
  const bottom = clamp(Math.round(r.y + r.height), 0, H);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** Kích thước ảnh kết quả. */
export function resultSize(state: EditState, W: number, H: number): { width: number; height: number } {
  return viewSize(state.crop?.width ?? W, state.crop?.height ?? H, state.rotate);
}

export function isFullFrame(crop: Rect | null, W: number, H: number): boolean {
  return !crop || (crop.x === 0 && crop.y === 0 && crop.width === W && crop.height === H);
}

export function sameState(a: EditState, b: EditState, W: number, H: number): boolean {
  const ca = isFullFrame(a.crop, W, H) ? null : a.crop;
  const cb = isFullFrame(b.crop, W, H) ? null : b.crop;
  const sameCrop = ca === null || cb === null ? ca === cb : ca.x === cb.x && ca.y === cb.y && ca.width === cb.width && ca.height === cb.height;
  return sameCrop && a.rotate === b.rotate && a.flipH === b.flipH;
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}
