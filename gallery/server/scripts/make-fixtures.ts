// Sinh dữ liệu kiểm thử vào fixtures/ (đã gitignore):  npm run fixtures
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import exifr from "exifr";
import { SERVER_ROOT } from "../src/config.js";
import {
  makeExifRotatedJpeg,
  makeFakeJpeg,
  makeJpeg,
  makeOversizePng,
  makePixelBomb,
  makePng,
  truncate,
} from "./fixtures-lib.js";

const dir = path.join(SERVER_ROOT, "fixtures");
await fs.mkdir(dir, { recursive: true });

const files: [string, Buffer, string][] = [
  ["01-landscape.jpg", await makeJpeg(2400, 1600, "Landscape JPEG", 200), "JPEG 2400×1600 hợp lệ -> 3 variant 320/960/1600"],
  ["02-alpha.png", await makePng(1000, 750, "PNG alpha"), "PNG có kênh alpha 1000×750 -> 320/960/1000"],
  ["03-portrait-exif6-gps.jpg", await makeExifRotatedJpeg(), "Pixels lưu ngang 1600×1200, EXIF Orientation=6, GPS giả (Hồ Gươm) -> phải thành ảnh dọc 1200×1600, không còn GPS"],
  ["04-small.png", await makePng(300, 200, "small", false), "PNG 300×200 -> chỉ 1 variant 300 (không phóng lớn)"],
  ["05-text-renamed.jpg", makeFakeJpeg(), "File text đổi đuôi .jpg -> UNSUPPORTED_TYPE"],
  ["06-truncated.jpg", truncate(await makeJpeg(1600, 1200, "truncated")), "JPEG thiếu 40% bytes cuối -> DECODE_FAILED"],
  ["07-truncated.png", truncate(await makePng(800, 600, "truncated")), "PNG thiếu bytes cuối -> DECODE_FAILED"],
  ["08-over-10mib.png", await makeOversizePng(10 * 1024 * 1024), "PNG nhiễu > 10 MiB -> FILE_TOO_LARGE"],
  ["09-48-megapixel.png", await makePixelBomb(8000, 6000), "PNG nhỏ nhưng 8000×6000 = 48 triệu pixel -> TOO_MANY_PIXELS"],
];

const lines = ["# Dữ liệu kiểm thử", "", "| File | Bytes | Mô tả |", "| --- | ---: | --- |"];
for (const [name, data, note] of files) {
  await fs.writeFile(path.join(dir, name), data);
  lines.push(`| ${name} | ${data.length.toLocaleString("en-US")} | ${note} |`);
}
const exif = await sharp(files[2]![1]).metadata();
const gps = await exifr.gps(files[2]![1]);
lines.push("", `03-portrait-exif6-gps.jpg: orientation=${exif.orientation}, GPS=${JSON.stringify(gps)}`);
await fs.writeFile(path.join(dir, "README.md"), lines.join("\n") + "\n");
console.log(lines.join("\n"));
console.log(`\nĐã ghi vào ${dir}`);
