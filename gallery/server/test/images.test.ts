import { describe, expect, it } from "vitest";
import sharp from "sharp";
import exifr from "exifr";
import { FileRejection } from "../src/errors.js";
import { generateVariants, inspectImage, normalizeImage, planVariants } from "../src/images/pipeline.js";
import { detectSignature } from "../src/images/signature.js";
import { makeExifRotatedJpeg, makeFakeJpeg, makeJpeg, makePixelBomb, makePng, truncate } from "../scripts/fixtures-lib.js";

const SPECS = [
  { width: 320, quality: 75 },
  { width: 960, quality: 82 },
  { width: 1600, quality: 86 },
];
const MAX_PIXELS = 40_000_000;

async function rejection(promise: Promise<unknown>): Promise<FileRejection> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof FileRejection) return err;
    throw err;
  }
  throw new Error("Mong đợi FileRejection nhưng promise thành công");
}

/** Độ sáng trung bình của một vùng (0-255) */
async function brightness(buf: Buffer, region: { left: number; top: number; width: number; height: number }) {
  const { data } = await sharp(buf).extract(region).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return data.reduce((a, b) => a + b, 0) / data.length;
}

describe("detectSignature", () => {
  it("nhận JPEG và PNG theo magic bytes", async () => {
    expect(detectSignature(await makeJpeg(10, 10))).toBe("jpeg");
    expect(detectSignature(await makePng(10, 10))).toBe("png");
  });
  it("từ chối file text đổi đuôi, GIF, WebP và file quá ngắn", async () => {
    expect(detectSignature(makeFakeJpeg())).toBeNull();
    expect(detectSignature(Buffer.from("GIF89a....."))).toBeNull();
    expect(detectSignature(await sharp({ create: { width: 4, height: 4, channels: 3, background: "#000" } }).webp().toBuffer())).toBeNull();
    expect(detectSignature(Buffer.from([0xff, 0xd8]))).toBeNull();
  });
});

describe("planVariants", () => {
  it("ảnh lớn có đủ 3 variant", () => {
    expect(planVariants(4000, SPECS).map((v) => v.width)).toEqual([320, 960, 1600]);
  });
  it("không phóng lớn và không tạo chiều rộng trùng", () => {
    expect(planVariants(800, SPECS).map((v) => v.width)).toEqual([320, 800]);
    expect(planVariants(960, SPECS).map((v) => v.width)).toEqual([320, 960]);
    expect(planVariants(300, SPECS).map((v) => v.width)).toEqual([300]);
    expect(planVariants(320, SPECS).map((v) => v.width)).toEqual([320]);
  });
  it("giữ quality của từng mức", () => {
    expect(planVariants(800, SPECS)).toEqual([
      { width: 320, quality: 75 },
      { width: 800, quality: 82 },
    ]);
  });
});

describe("inspectImage", () => {
  it("chặn ảnh vượt số pixel chỉ bằng header, trước khi giải mã", async () => {
    const bomb = await makePixelBomb(8000, 6000);
    expect(bomb.length).toBeLessThan(1024 * 1024); // file nhỏ nhưng 48 triệu pixel
    const err = await rejection(inspectImage(bomb, "png", MAX_PIXELS));
    expect(err.code).toBe("TOO_MANY_PIXELS");
    expect(err.details).toMatchObject({ width: 8000, height: 6000, pixels: 48_000_000 });
  });
  it("chặn file có chữ ký PNG nhưng nội dung là JPEG", async () => {
    const jpeg = await makeJpeg(20, 20);
    const err = await rejection(inspectImage(jpeg, "png", MAX_PIXELS));
    expect(err.code).toBe("UNSUPPORTED_TYPE");
  });
});

describe("normalizeImage", () => {
  it("xoay pixels theo EXIF orientation rồi bỏ EXIF và GPS", async () => {
    const input = await makeExifRotatedJpeg();
    const meta = await sharp(input).metadata();
    expect([meta.width, meta.height, meta.orientation]).toEqual([1600, 1200, 6]);
    expect(await exifr.gps(input)).toMatchObject({ latitude: expect.closeTo(21.03, 2) });

    const out = await normalizeImage(input, "jpeg", MAX_PIXELS);
    expect([out.width, out.height]).toEqual([1200, 1600]);
    const outMeta = await sharp(out.buffer).metadata();
    expect(outMeta.orientation).toBeUndefined();
    expect(outMeta.exif).toBeUndefined();
    expect(await exifr.gps(out.buffer)).toBeUndefined();

    // Dải trắng chữ "TOP" phải nằm ở giữa mép trên của ảnh dọc
    const topMiddle = await brightness(out.buffer, { left: 575, top: 10, width: 50, height: 50 });
    const bottomMiddle = await brightness(out.buffer, { left: 575, top: 1500, width: 50, height: 50 });
    expect(topMiddle).toBeGreaterThan(200);
    expect(bottomMiddle).toBeLessThan(150);
  });

  it("giữ PNG (có kênh alpha) là PNG", async () => {
    const out = await normalizeImage(await makePng(400, 300), "png", MAX_PIXELS);
    expect(out.mime).toBe("image/png");
    expect((await sharp(out.buffer).metadata()).hasAlpha).toBe(true);
  });

  it("từ chối JPEG và PNG thiếu bytes ở cuối dù chữ ký đúng", async () => {
    const jpeg = truncate(await makeJpeg(1600, 1200));
    expect(detectSignature(jpeg)).toBe("jpeg");
    expect((await rejection(normalizeImage(jpeg, "jpeg", MAX_PIXELS))).code).toBe("DECODE_FAILED");

    const png = truncate(await makePng(800, 600));
    expect(detectSignature(png)).toBe("png");
    const err = await rejection(inspectImage(png, "png", MAX_PIXELS).then(() => normalizeImage(png, "png", MAX_PIXELS)));
    expect(err.code).toBe("DECODE_FAILED");
  });
});

describe("generateVariants", () => {
  it("sinh WebP giữ tỉ lệ, không EXIF, đúng kích thước thực tế", async () => {
    const normalized = await normalizeImage(await makeJpeg(2400, 1600), "jpeg", MAX_PIXELS);
    const variants = await generateVariants(normalized, SPECS);
    expect(variants.map((v) => [v.width, v.height])).toEqual([
      [320, 213],
      [960, 640],
      [1600, 1067],
    ]);
    for (const v of variants) {
      const meta = await sharp(v.buffer).metadata();
      expect(meta.format).toBe("webp");
      expect([meta.width, meta.height]).toEqual([v.width, v.height]);
      expect(meta.exif).toBeUndefined();
      expect(v.bytes).toBe(v.buffer.length);
    }
    // Thumbnail nhẹ hơn hẳn bản lớn
    expect(variants[0]!.bytes).toBeLessThan(variants[2]!.bytes);
  });

  it("ảnh nhỏ chỉ sinh variant không phóng lớn", async () => {
    const normalized = await normalizeImage(await makePng(300, 200, "small", false), "png", MAX_PIXELS);
    const variants = await generateVariants(normalized, SPECS);
    expect(variants.map((v) => [v.width, v.height])).toEqual([[300, 200]]);
  });
});
