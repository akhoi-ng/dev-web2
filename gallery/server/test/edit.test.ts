import { describe, expect, it } from "vitest";
import sharp from "sharp";
import exifr from "exifr";
import {
  EditValidationError,
  IDENTITY_EDIT,
  MIN_EDGE,
  ROTATIONS,
  editedSize,
  normalizeEditParams,
  renderEdit,
  sameEdit,
  type EditParams,
} from "../src/images/edit.js";
import { generateVariants } from "../src/images/pipeline.js";
import { makeJpeg } from "../scripts/fixtures-lib.js";

const MAX_PIXELS = 40_000_000;
const CELL = 16;
const COLS = 4;
const ROWS = 2;

/** Ảnh PNG 4x2 ô, mỗi ô 16px một mức xám riêng (ô i có giá trị i*30) để đọc lại vị trí sau biến đổi. */
async function gridPng(): Promise<Buffer> {
  const w = COLS * CELL;
  const h = ROWS * CELL;
  const raw = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = (Math.floor(x / CELL) + COLS * Math.floor(y / CELL)) * 30;
      raw.fill(v, (y * w + x) * 3, (y * w + x) * 3 + 3);
    }
  }
  return sharp(raw, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
}

/** Đọc lưới ô từ ảnh đầu ra (lấy pixel giữa mỗi ô). */
async function readGrid(buf: Buffer): Promise<number[][]> {
  const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
  const rows: number[][] = [];
  for (let cy = 0; cy < info.height / CELL; cy++) {
    const row: number[] = [];
    for (let cx = 0; cx < info.width / CELL; cx++) {
      const px = cx * CELL + CELL / 2;
      const py = cy * CELL + CELL / 2;
      row.push(Math.round(data[(py * info.width + px) * info.channels]! / 30));
    }
    rows.push(row);
  }
  return rows;
}

/** Cài đặt tham chiếu trên lưới ô: cắt -> xoay theo chiều kim đồng hồ -> lật ngang. */
function expectedGrid(params: EditParams): number[][] {
  let g = Array.from({ length: ROWS }, (_, y) => Array.from({ length: COLS }, (_, x) => x + COLS * y));
  if (params.crop) {
    const { x, y, width, height } = params.crop;
    g = g.slice(y / CELL, (y + height) / CELL).map((r) => r.slice(x / CELL, (x + width) / CELL));
  }
  for (let r = 0; r < params.rotate / 90; r++) {
    const h = g.length;
    const w = g[0]!.length;
    g = Array.from({ length: w }, (_, y) => Array.from({ length: h }, (_, x) => g[h - 1 - x]![y]!));
  }
  if (params.flipH) g = g.map((r) => [...r].reverse());
  return g;
}

describe("renderEdit: cắt -> xoay -> lật đúng thứ tự", async () => {
  const png = await gridPng();
  const crops = [null, { x: CELL, y: 0, width: 3 * CELL, height: 2 * CELL }];
  for (const crop of crops) {
    for (const rotate of ROTATIONS) {
      for (const flipH of [false, true]) {
        const params: EditParams = { crop, rotate, flipH };
        it(`crop=${crop ? "3x2 ô" : "không"} rotate=${rotate} flipH=${flipH}`, async () => {
          const out = await renderEdit(png, params, MAX_PIXELS);
          expect(await readGrid(out.buffer)).toEqual(expectedGrid(params));
          expect({ width: out.width, height: out.height }).toEqual(editedSize(params, { width: COLS * CELL, height: ROWS * CELL }));
        });
      }
    }
  }
});

describe("normalizeEditParams", () => {
  const source = { width: 1000, height: 600 };

  it("nhận vùng cắt nằm trong ảnh", () => {
    const p = normalizeEditParams({ crop: { x: 10, y: 20, width: 300, height: 200 }, rotate: 90, flipH: true }, source);
    expect(p).toEqual({ crop: { x: 10, y: 20, width: 300, height: 200 }, rotate: 90, flipH: true });
  });

  it("vùng cắt phủ toàn ảnh = không cắt", () => {
    expect(normalizeEditParams({ crop: { x: 0, y: 0, width: 1000, height: 600 }, rotate: 0, flipH: false }, source).crop).toBeNull();
  });

  it.each([
    { x: -1, y: 0, width: 100, height: 100 },
    { x: 950, y: 0, width: 100, height: 100 },
    { x: 0, y: 550, width: 100, height: 100 },
    { x: 0.5, y: 0, width: 100, height: 100 },
    { x: 0, y: 0, width: MIN_EDGE - 1, height: 100 },
  ])("từ chối vùng cắt sai %o", (crop) => {
    expect(() => normalizeEditParams({ crop, rotate: 0, flipH: false }, source)).toThrow(EditValidationError);
  });

  it("từ chối góc xoay không phải bội số 90", () => {
    expect(() => normalizeEditParams({ crop: null, rotate: 45 as EditParams["rotate"], flipH: false }, source)).toThrow(EditValidationError);
  });

  it("sameEdit so sánh đủ crop, rotate, flipH", () => {
    expect(sameEdit(IDENTITY_EDIT, { crop: null, rotate: 0, flipH: false })).toBe(true);
    expect(sameEdit(IDENTITY_EDIT, { crop: null, rotate: 0, flipH: true })).toBe(false);
    expect(sameEdit({ ...IDENTITY_EDIT, crop: { x: 1, y: 1, width: 20, height: 20 } }, IDENTITY_EDIT)).toBe(false);
  });
});

describe("variant sau chỉnh sửa", () => {
  it("sinh WebP theo kích thước mới, không có EXIF, không phóng lớn", async () => {
    const jpeg = await makeJpeg(2400, 1600, "edit", 200);
    const edited = await renderEdit(jpeg, { crop: { x: 400, y: 200, width: 1200, height: 900 }, rotate: 90, flipH: false }, MAX_PIXELS);
    expect([edited.width, edited.height]).toEqual([900, 1200]);
    const variants = await generateVariants(edited, [
      { width: 320, quality: 75 },
      { width: 960, quality: 82 },
      { width: 1600, quality: 86 },
    ]);
    expect(variants.map((v) => `${v.width}x${v.height}`)).toEqual(["320x427", "900x1200"]);
    const meta = await sharp(variants[1]!.buffer).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.exif).toBeUndefined();
    expect(await exifr.gps(variants[1]!.buffer).catch(() => undefined)).toBeUndefined();
  });
});
