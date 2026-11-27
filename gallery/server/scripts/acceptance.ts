/**
 * Nghiệm thu đầu cuối theo đề Block 11. Script tự khởi động server (cổng riêng), gửi request thật qua
 * HTTP, rồi đối chiếu response với DB và kho file. Kết quả ghi ra acceptance-out/report.md và report.json.
 *
 *   npm run acceptance                 giữ lại ảnh đã upload để chụp màn hình gallery
 *   npm run acceptance -- --clean      xóa ảnh do script tạo khi xong
 *   npm run acceptance -- --port 4100  đổi cổng (mặc định ACCEPT_PORT hoặc 4100)
 *
 * Cần .env hợp lệ (DATABASE_URL, JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD, storage) và đã chạy migrate.
 */
import { config } from "./_env.js";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import sharp from "sharp";
import exifr from "exifr";
import { SERVER_ROOT } from "../src/config.js";
import { disconnectPrisma, getPrisma } from "../src/db.js";
import { createStorageRegistry } from "../src/storage/index.js";
import {
  makeExifRotatedJpeg,
  makeFakeJpeg,
  makeJpeg,
  makeJunkJpeg,
  makeOversizePng,
  makePixelBomb,
  makePng,
  truncate,
} from "./fixtures-lib.js";

const argValue = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const PORT = Number(argValue("--port") ?? process.env.ACCEPT_PORT ?? 4100);
const BASE = `http://127.0.0.1:${PORT}`;
const CLEAN = process.argv.includes("--clean");
const OUT_DIR = path.join(SERVER_ROOT, "acceptance-out");
const MiB = 1024 * 1024;
const IMMUTABLE = "public, max-age=31536000, immutable";

if (!config.admin) {
  console.error("Cần ADMIN_EMAIL và ADMIN_PASSWORD trong .env");
  process.exit(1);
}
const admin = config.admin;
const prisma = getPrisma();
const registry = await createStorageRegistry({ ...config, faults: new Set() });
const storage = registry.default;
// UA rõ ràng: Cloudflare trước CDN có thể chặn UA mặc định của Node (lỗi 1010)
const UA = "Mozilla/5.0 (compatible; PhotoGallery-Acceptance/1.0)";

// ───────────────────────── tiện ích ─────────────────────────

interface Check {
  group: string;
  name: string;
  ok: boolean;
  /** Không áp dụng với cấu hình hiện tại (không tính vào đạt/không đạt) */
  skipped?: boolean;
  detail?: unknown;
}
const checks: Check[] = [];
const evidence: { title: string; body: string }[] = [];
let group = "";

function check(name: string, ok: boolean, detail?: unknown) {
  checks.push({ group, name, ok, ...(detail !== undefined ? { detail } : {}) });
  console.log(`  ${ok ? "\u2714" : "\u2718"} ${name}${ok || detail === undefined ? "" : `\n      ${JSON.stringify(detail).slice(0, 600)}`}`);
}
function skip(name: string, reason: string) {
  checks.push({ group, name, ok: true, skipped: true, detail: reason });
  console.log(`  – ${name} (bỏ qua: ${reason})`);
}
function section(title: string) {
  group = title;
  console.log(`\n\u25b6 ${title}`);
}
function addEvidence(title: string, value: unknown) {
  evidence.push({ title, body: typeof value === "string" ? value : JSON.stringify(value, null, 2) });
}

let server: ChildProcess | null = null;
let serverLog = "";

async function startServer(extraEnv: Record<string, string> = {}) {
  await stopServer();
  serverLog = "";
  server = spawn(process.execPath, ["--import", "tsx", path.join(SERVER_ROOT, "src", "server.ts")], {
    cwd: SERVER_ROOT,
    env: { ...process.env, PORT: String(PORT), CLEANUP_INTERVAL_MS: "0", LOG_LEVEL: "warn", FAULT_INJECTION: "", NODE_ENV: "development", ...extraEnv },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout?.on("data", (d) => (serverLog += d));
  server.stderr?.on("data", (d) => (serverLog += d));
  const deadline = Date.now() + 40_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Server thoát sớm:\n${serverLog}`);
    try {
      const res = await fetch(`${BASE}/healthz`);
      if (res.ok) return;
    } catch {
      /* chưa sẵn sàng */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Server không khởi động sau 40 giây:\n${serverLog}`);
}

async function stopServer() {
  if (!server || server.exitCode !== null) return;
  const proc = server;
  await new Promise<void>((resolve) => {
    proc.once("exit", () => resolve());
    proc.kill();
  });
  server = null;
}

let cookie = "";
interface Res {
  status: number;
  headers: Headers;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any;
  buffer: Buffer;
}

async function call(method: string, url: string, opts: { json?: unknown; form?: FormData; auth?: boolean; headers?: Record<string, string> } = {}): Promise<Res> {
  const headers: Record<string, string> = { "user-agent": UA, ...opts.headers };
  if (opts.auth !== false && cookie) headers.cookie = cookie;
  if (method !== "GET" && method !== "HEAD" && !("x-requested-with" in headers)) headers["x-requested-with"] = "XMLHttpRequest";
  let body: string | FormData | undefined;
  if (opts.json !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(opts.json);
  } else if (opts.form) {
    body = opts.form;
  }
  const res = await fetch(url.startsWith("http") ? url : `${BASE}${url}`, { method, headers, ...(body ? { body } : {}), redirect: "manual" });
  const buffer = Buffer.from(await res.arrayBuffer());
  let parsed: unknown = null;
  if ((res.headers.get("content-type") ?? "").includes("json") && buffer.length) parsed = JSON.parse(buffer.toString("utf8"));
  return { status: res.status, headers: res.headers, body: parsed, buffer };
}

async function login() {
  const res = await call("POST", "/api/auth/login", { json: { email: admin.email, password: admin.password }, auth: false });
  if (res.status !== 200) throw new Error(`Đăng nhập thất bại: ${res.status} ${JSON.stringify(res.body)}`);
  cookie = (res.headers.get("set-cookie") ?? "").split(";")[0]!;
  return res;
}

function form(files: [string, Buffer][], fields: Record<string, string> = {}) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  for (const [name, data] of files) f.append("photos", new Blob([new Uint8Array(data)]), name);
  return f;
}

function rawStatus(url: string, headers: Record<string, string>): Promise<number> {
  const full = url.startsWith("http") ? url : `${BASE}${url}`;
  // Ảnh có thể nằm trên CDN/bucket HTTPS (S3_PUBLIC_BASE_URL)
  const client = full.startsWith("https:") ? https : http;
  return new Promise((resolve, reject) => {
    const req = client.get(full, { headers: { "user-agent": UA, ...headers } }, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    req.on("error", reject);
  });
}

async function storageKeys(name = registry.defaultName): Promise<Set<string>> {
  const keys = new Set<string>();
  for await (const obj of registry.get(name).list("photos/")) keys.add(obj.key);
  return keys;
}

async function brightness(buf: Buffer, region: { left: number; top: number; width: number; height: number }) {
  const { data } = await sharp(buf).extract(region).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return data.reduce((a, b) => a + b, 0) / data.length;
}

const keysOf = (photo: { variants: { storageKey: string }[]; original: { storageKey: string } }) => [
  ...photo.variants.map((v) => v.storageKey),
  photo.original.storageKey,
];
const photoIdFromKey = (key: string) => key.split("/")[1]!;
const created: string[] = [];
const createdAlbums: string[] = [];

// ───────────────────────── dữ liệu kiểm thử ─────────────────────────

const fx = {
  landscape: await makeJpeg(2400, 1600, "Landscape JPEG", 200),
  alphaPng: await makePng(1000, 750, "PNG alpha"),
  exif: await makeExifRotatedJpeg(),
  smallPng: await makePng(300, 200, "small", false),
  textJpg: makeFakeJpeg(),
  truncatedJpg: truncate(await makeJpeg(1600, 1200, "truncated")),
  truncatedPng: truncate(await makePng(800, 600, "truncated")),
  oversize: await makeOversizePng(10 * MiB),
  bomb: await makePixelBomb(8000, 6000),
};

// ───────────────────────── kịch bản ─────────────────────────

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  section("Khởi động và xác thực");
  await startServer();
  check("Server chạy và trả /healthz", true);
  const anonUpload = await call("POST", "/api/admin/photos", { form: form([["a.jpg", fx.landscape]]), auth: false });
  check("Upload khi chưa đăng nhập bị từ chối 401", anonUpload.status === 401, anonUpload.status);
  await login();
  check("Đăng nhập admin, nhận cookie HttpOnly", cookie.startsWith("gallery_session="));
  const noHeader = await call("POST", "/api/admin/photos", { form: form([["a.jpg", fx.landscape]]), headers: { "x-requested-with": "" } });
  check("Request ghi thiếu X-Requested-With bị chặn 403 (chống CSRF)", noHeader.status === 403, noHeader.status);
  const storageTest = await call("POST", "/api/admin/storage/test");
  check("Nút Kiểm tra kết nối: ghi-đọc-xóa file thử thành công", storageTest.status === 200 && storageTest.body.ok, storageTest.body);
  addEvidence("Kiểm tra kết nối kho (POST /api/admin/storage/test)", storageTest.body);

  // ── Upload JPEG + PNG + EXIF + ảnh nhỏ trong một request ──
  section("Upload JPEG, PNG, ảnh có EXIF orientation/GPS và ảnh nhỏ trong MỘT request");
  const keysBefore = await storageKeys();
  const up = await call("POST", "/api/admin/photos", {
    form: form(
      [
        ["bờ-biển.jpg", fx.landscape],
        ["logo-alpha.png", fx.alphaPng],
        ["chup-doc-iphone.jpg", fx.exif],
        ["nho.png", fx.smallPng],
      ],
      {
        tags: "kiểm thử, block 11",
        items: JSON.stringify([
          { title: "Bờ biển lúc chiều", altText: "Bãi biển với bầu trời chuyển màu xanh tím" },
          { title: "Logo nền trong suốt", altText: "Khối màu cam trên nền trong suốt" },
          { title: "Ảnh chụp dọc từ điện thoại", altText: "Ảnh dọc có dải trắng chữ TOP ở mép trên" },
          { title: "Ảnh nhỏ 300px", altText: "Khối màu nhỏ" },
        ]),
      },
    ),
  });
  addEvidence("Response upload 4 ảnh hợp lệ (rút gọn)", summarizeUpload(up.body));
  check("HTTP 201, nhận đủ 4 ảnh", up.status === 201 && up.body?.summary?.accepted === 4, { status: up.status, summary: up.body?.summary });
  const results = (up.body?.results ?? []) as { index: number; ok: boolean; photo: PhotoDto }[];
  check("Kết quả gắn với index của file trong request", results.map((r) => r.index).join() === "0,1,2,3");
  const [landscape, alpha, portrait, small] = results.map((r) => r.photo);
  if (!landscape || !alpha || !portrait || !small) throw new Error("Upload hợp lệ thất bại, dừng nghiệm thu");
  created.push(landscape.id, alpha.id, portrait.id, small.id);

  const widths = (p: PhotoDto) => p.variants.map((v) => v.width).join(",");
  check("JPEG 2400px -> variant 320, 960, 1600", widths(landscape) === "320,960,1600", widths(landscape));
  check("PNG 1000px -> 320, 960, 1000 (không phóng lớn)", widths(alpha) === "320,960,1000", widths(alpha));
  check("Ảnh 300px -> chỉ một variant 300", widths(small) === "300", widths(small));
  check("Ảnh EXIF 6 được xoay thành ảnh dọc 1200x1600", portrait.width === 1200 && portrait.height === 1600, [portrait.width, portrait.height]);
  check("Variant giữ tỉ lệ ảnh gốc", landscape.variants.every((v) => Math.abs(v.width / v.height - 1.5) < 0.01));

  const dbPhotos = await prisma.photo.findMany({ where: { id: { in: created } }, include: { variants: true } });
  check("DB có 4 Photo và 10 PhotoVariant tương ứng", dbPhotos.length === 4 && dbPhotos.reduce((n, p) => n + p.variants.length, 0) === 10);
  const allDbKeys = dbPhotos.flatMap((p) => [p.originalKey, ...p.variants.map((v) => v.storageKey)]);
  check(
    "DB lưu storage key, không lưu đường dẫn tuyệt đối hay URL",
    allDbKeys.every((k) => /^photos\/[0-9a-f-]{36}\//.test(k) && !k.includes(":") && !k.includes("\\")),
    allDbKeys.slice(0, 3),
  );
  const keysAfter = await storageKeys();
  const newKeys = [...keysAfter].filter((k) => !keysBefore.has(k));
  check("Kho có đúng các file mà DB tham chiếu", newKeys.length === allDbKeys.length && allDbKeys.every((k) => keysAfter.has(k)), { newKeys: newKeys.length, dbKeys: allDbKeys.length });
  addEvidence(
    "Photo và PhotoVariant trong DB sau khi upload",
    dbPhotos.map((p) => ({
      id: p.id,
      title: p.title,
      alt_text: p.altText,
      size: `${p.width}x${p.height}`,
      original_key: p.originalKey,
      variants: p.variants.sort((a, b) => a.width - b.width).map((v) => `${v.width}x${v.height} ${v.bytes}B ${v.mime} ${v.storageKey}`),
    })),
  );

  // ── Media: Content-Type, Cache-Control, EXIF, hướng ảnh ──
  section("Phân phối ảnh qua /media");
  const thumb = await call("GET", landscape.variants[0]!.url, { auth: false });
  check("GET variant trả 200", thumb.status === 200, thumb.status);
  check("Content-Type: image/webp", thumb.headers.get("content-type") === "image/webp", thumb.headers.get("content-type"));
  check(
    "Cache-Control: public, max-age=31536000, immutable",
    thumb.headers.get("cache-control") === "public, max-age=31536000, immutable",
    thumb.headers.get("cache-control"),
  );
  addEvidence(`Header của GET ${landscape.variants[0]!.url}`, Object.fromEntries(thumb.headers.entries()));
  const etag = thumb.headers.get("etag");
  if (etag) {
    // Dùng node:http như browser revalidate (fetch của Node tự thêm Cache-Control: no-cache khi có If-None-Match)
    const status = await rawStatus(landscape.variants[0]!.url, { "if-none-match": etag, "cache-control": "max-age=0" });
    check("Gửi lại với If-None-Match nhận 304", status === 304, status);
  }
  const thumbMeta = await sharp(thumb.buffer).metadata();
  check("Bytes tải về là WebP 320px không có EXIF", thumbMeta.format === "webp" && thumbMeta.width === 320 && !thumbMeta.exif);

  const portraitMedium = await call("GET", portrait.variants.find((v) => v.width === 960)!.url, { auth: false });
  const pm = await sharp(portraitMedium.buffer).metadata();
  check("Variant của ảnh EXIF là ảnh dọc 960x1280", pm.width === 960 && pm.height === 1280, [pm.width, pm.height]);
  check("Variant không còn EXIF/GPS", !pm.exif && (await exifr.gps(portraitMedium.buffer).catch(() => undefined)) === undefined);
  const top = await brightness(portraitMedium.buffer, { left: 455, top: 8, width: 50, height: 40 });
  const bottom = await brightness(portraitMedium.buffer, { left: 455, top: 1200, width: 50, height: 40 });
  check("Dải chữ TOP nằm ở mép trên (ảnh hiển thị đúng hướng)", top > 200 && bottom < 150, { top: Math.round(top), bottom: Math.round(bottom) });
  addEvidence("EXIF của file gửi lên và của variant", {
    input: { orientation: (await sharp(fx.exif).metadata()).orientation, gps: await exifr.gps(fx.exif) },
    variant960: { orientation: pm.orientation ?? null, exif: Boolean(pm.exif), gps: (await exifr.gps(portraitMedium.buffer).catch(() => undefined)) ?? null },
  });

  let original = await call("GET", portrait.original.downloadUrl, { auth: false });
  // DOWNLOAD_MODE=presigned: server chuyển hướng tới URL có chữ ký của bucket
  const presigned = original.status === 302 && original.headers.get("location");
  if (presigned) original = await call("GET", presigned, { auth: false });
  const om = await sharp(original.buffer).metadata();
  check(
    `Tải bản gốc${presigned ? " (302 tới presigned URL)" : ""}: Content-Disposition attachment, đúng hướng, không GPS`,
    original.status === 200 &&
      (original.headers.get("content-disposition") ?? "").startsWith("attachment;") &&
      om.width === 1200 &&
      om.height === 1600 &&
      !om.exif,
    { status: original.status, disposition: original.headers.get("content-disposition"), size: [om.width, om.height] },
  );
  const traversal = await call("GET", "/media/photos/..%2f..%2f.env", { auth: false });
  check("Key không hợp lệ trên /media trả 404", traversal.status === 404, traversal.status);
  const originalViaMedia = await call("GET", `/media/${portrait.original.storageKey}`, { auth: false });
  check("Bản gốc không phục vụ qua /media", originalViaMedia.status === 404, originalViaMedia.status);

  // ── Trộn file hợp lệ và file lỗi ──
  section("Trộn file hợp lệ với file giả, file thiếu bytes, file quá lớn, ảnh quá nhiều pixel");
  const keysBeforeMixed = await storageKeys();
  const photosBeforeMixed = await prisma.photo.count();
  const mixed = await call("POST", "/api/admin/photos", {
    form: form([
      ["hop-le.jpg", fx.landscape],
      ["text-doi-duoi.jpg", fx.textJpg],
      ["thieu-bytes.jpg", fx.truncatedJpg],
      ["qua-10mib.png", fx.oversize],
      ["48-trieu-pixel.png", fx.bomb],
    ]),
  });
  addEvidence("Response request trộn file hợp lệ và file lỗi", summarizeUpload(mixed.body));
  const codes = (mixed.body?.results ?? []).map((r: { ok: boolean; error?: { code: string } }) => (r.ok ? "OK" : r.error!.code));
  check("HTTP 207, chỉ file hợp lệ được nhận", mixed.status === 207 && mixed.body.summary.accepted === 1, { status: mixed.status, codes });
  check("Mã lỗi theo từng index", codes.join() === "OK,UNSUPPORTED_TYPE,DECODE_FAILED,FILE_TOO_LARGE,TOO_MANY_PIXELS", codes);
  const mixedOk = mixed.body?.results?.[0]?.photo as PhotoDto | undefined;
  if (mixedOk) created.push(mixedOk.id);
  const mixedNew = [...(await storageKeys())].filter((k) => !keysBeforeMixed.has(k));
  check(
    "Kho chỉ thêm file của ảnh hợp lệ, file bị từ chối không để lại gì",
    mixedOk !== undefined && mixedNew.length === keysOf(mixedOk).length && mixedNew.every((k) => k.includes(mixedOk.id)),
    mixedNew,
  );
  check("DB chỉ thêm 1 Photo", (await prisma.photo.count()) === photosBeforeMixed + 1);
  const pngTrunc = await call("POST", "/api/admin/photos", { form: form([["thieu-bytes.png", fx.truncatedPng]]) });
  check("PNG thiếu bytes: 422 DECODE_FAILED", pngTrunc.status === 422 && pngTrunc.body.results[0].error.code === "DECODE_FAILED", pngTrunc.body?.results?.[0]?.error);

  // ── Lỗi cấp request ──
  section("Lỗi cấp request: quá số file, quá tổng dung lượng");
  const snapshot = { keys: (await storageKeys()).size, photos: await prisma.photo.count() };
  const six = await call("POST", "/api/admin/photos", { form: form(Array.from({ length: 6 }, (_, i) => [`${i}.png`, fx.smallPng] as [string, Buffer])) });
  check("6 file: 400 TOO_MANY_FILES", six.status === 400 && six.body.error.code === "TOO_MANY_FILES", six.body);
  const huge = await call("POST", "/api/admin/photos", { form: form(Array.from({ length: 5 }, (_, i) => [`big-${i}.jpg`, makeJunkJpeg(12 * MiB)] as [string, Buffer])) });
  check("5 file x 12 MiB (60 MiB > 55 MiB): 413 PAYLOAD_TOO_LARGE", huge.status === 413 && huge.body.error.code === "PAYLOAD_TOO_LARGE", huge.body);
  addEvidence("Response 413 khi tổng request vượt 55 MiB", { status: huge.status, body: huge.body });
  check("Không có ảnh nào được công bố, kho và DB không đổi", (await storageKeys()).size === snapshot.keys && (await prisma.photo.count()) === snapshot.photos);

  // ── Gallery API, album, tag, tìm kiếm ──
  section("Gallery: danh sách, album, tag, tìm kiếm");
  const list = await call("GET", "/api/photos?limit=100", { auth: false });
  const listed = list.body.items.find((p: PhotoDto) => p.id === landscape.id) as PhotoDto | undefined;
  check(
    "Danh sách công khai có srcSet đủ variant, width/height và alt text",
    Boolean(listed && listed.srcSet.includes("320w") && listed.srcSet.includes("1600w") && listed.width === 2400 && listed.altText),
    listed?.srcSet,
  );
  const album = await call("POST", "/api/admin/albums", { json: { title: `Kiểm thử ${new Date().toISOString().slice(0, 16)}`, description: "Album do script nghiệm thu tạo" } });
  check("Tạo album", album.status === 201, album.body);
  if (album.body?.id) createdAlbums.push(album.body.id);
  await call("PATCH", `/api/admin/photos/${landscape.id}`, { json: { albumId: album.body.id } });
  const byAlbum = await call("GET", `/api/photos?album=${album.body.slug}`, { auth: false });
  check("Lọc theo album", byAlbum.body.items.length === 1 && byAlbum.body.items[0].id === landscape.id);
  const byTag = await call("GET", `/api/photos?tag=${encodeURIComponent("block 11")}&limit=100`, { auth: false });
  check("Lọc theo tag", byTag.body.items.some((p: PhotoDto) => p.id === portrait.id));
  const bySearch = await call("GET", `/api/photos?q=${encodeURIComponent("bờ biển")}&limit=100`, { auth: false });
  check("Tìm theo tiêu đề (không phân biệt hoa thường)", bySearch.body.items.some((p: PhotoDto) => p.id === landscape.id));

  // ── Ẩn ảnh ──
  section("Ẩn ảnh");
  await call("PATCH", `/api/admin/photos/${alpha.id}`, { json: { status: "HIDDEN" } });
  const hiddenApi = await call("GET", `/api/photos/${alpha.id}`, { auth: false });
  const directMedia = /^https?:\/\//.test(alpha.variants[0]!.url);
  if (directMedia) {
    check("Ảnh ẩn: khách nhận 404 ở API và gallery", hiddenApi.status === 404, hiddenApi.status);
    const proxied = registry.info().find((s) => !s.publicBaseUrl);
    if (!proxied) {
      skip("Ảnh ẩn: /media trả 404 cho khách, admin xem với Cache-Control private", "mọi kho đều tải thẳng từ bucket công khai, web server không chặn được URL đã biết");
    } else {
      // Kho mặc định là CDN công khai: kiểm việc chặn ảnh ẩn trên kho phục vụ qua /media
      const up2 = await call("POST", "/api/admin/photos", {
        form: form([["an-qua-media.png", fx.alphaPng]], { storage: proxied.name, items: JSON.stringify([{ title: "Ảnh ẩn qua /media", altText: "Khối màu cam" }]) }),
      });
      const hp = up2.body?.results?.[0]?.photo as PhotoDto | undefined;
      if (hp) {
        created.push(hp.id);
        await call("PATCH", `/api/admin/photos/${hp.id}`, { json: { status: "HIDDEN" } });
        const anon = await call("GET", hp.variants[0]!.url, { auth: false });
        const adminView = await call("GET", hp.variants[0]!.url);
        check(`Ảnh ẩn trong kho "${proxied.name}": /media trả 404 cho khách`, hp.variants[0]!.url.startsWith("/media/") && anon.status === 404, [hp.variants[0]!.url, anon.status]);
        check(
          `Ảnh ẩn trong kho "${proxied.name}": admin vẫn xem được, Cache-Control: private, no-store`,
          adminView.status === 200 && adminView.headers.get("cache-control") === "private, no-store",
          [adminView.status, adminView.headers.get("cache-control")],
        );
        await call("PATCH", `/api/admin/photos/${hp.id}`, { json: { status: "PUBLISHED" } });
        const pub = await call("GET", hp.variants[0]!.url, { auth: false });
        check(`Công bố lại trong kho "${proxied.name}": /media trả 200 kèm Cache-Control immutable`, pub.status === 200 && pub.headers.get("cache-control") === IMMUTABLE, [pub.status, pub.headers.get("cache-control")]);
        const d = await call("DELETE", `/api/admin/photos/${hp.id}`);
        if (d.status === 200) created.splice(created.indexOf(hp.id), 1);
      } else {
        check(`Upload vào kho "${proxied.name}" để kiểm ảnh ẩn`, false, up2.body);
      }
    }
  } else {
    const hiddenMedia = await call("GET", alpha.variants[0]!.url, { auth: false });
    const hiddenAdmin = await call("GET", alpha.variants[0]!.url);
    check("Ảnh ẩn: khách nhận 404 ở API và /media", hiddenApi.status === 404 && hiddenMedia.status === 404, [hiddenApi.status, hiddenMedia.status]);
    check(
      "Ảnh ẩn: admin vẫn xem được, Cache-Control: private, no-store",
      hiddenAdmin.status === 200 && hiddenAdmin.headers.get("cache-control") === "private, no-store",
      [hiddenAdmin.status, hiddenAdmin.headers.get("cache-control")],
    );
  }
  await call("PATCH", `/api/admin/photos/${alpha.id}`, { json: { status: "PUBLISHED" } });
  check("Công bố lại: khách xem được", (await call("GET", `/api/photos/${alpha.id}`, { auth: false })).status === 200);

  // ── Xóa ảnh ──
  section("Xóa ảnh: ẩn -> dọn file -> xóa metadata");
  const smallKeys = keysOf(small);
  const del = await call("DELETE", `/api/admin/photos/${small.id}`);
  check("DELETE trả 200 DELETED", del.status === 200 && del.body.status === "DELETED", del.body);
  const afterDel = await storageKeys();
  check("Kho không còn file nào của ảnh", smallKeys.every((k) => !afterDel.has(k)), smallKeys);
  check(
    "DB không còn Photo và PhotoVariant",
    (await prisma.photo.count({ where: { id: small.id } })) === 0 && (await prisma.photoVariant.count({ where: { photoId: small.id } })) === 0,
  );
  check("URL media cũ trả 404 khi gửi request mới tới origin", (await call("GET", small.variants[0]!.url, { auth: false })).status === 404);
  addEvidence("Response DELETE", del.body);
  created.splice(created.indexOf(small.id), 1);

  // ── Restart ──
  section("Khởi động lại web server");
  await startServer();
  await login();
  const afterRestartApi = await call("GET", `/api/photos/${portrait.id}`, { auth: false });
  const afterRestartMedia = await call("GET", portrait.variants[0]!.url, { auth: false });
  check("Gallery vẫn trả ảnh sau restart", afterRestartApi.status === 200);
  check("URL media vẫn hoạt động sau restart", afterRestartMedia.status === 200 && afterRestartMedia.headers.get("content-type") === "image/webp");

  await editScenario();

  // ── DB lỗi sau khi ghi file ──
  section("DB lỗi sau khi ghi file (FAULT_INJECTION=db-commit)");
  await startServer({ FAULT_INJECTION: "db-commit" });
  await login();
  const dbFail = await call("POST", "/api/admin/photos", { form: form([["db-loi.jpg", fx.landscape]]) });
  const dbFailResult = dbFail.body?.results?.[0];
  addEvidence("Response khi DB lỗi sau khi ghi file", dbFailResult);
  check("File bị từ chối với DB_WRITE_FAILED", dbFail.status === 422 && dbFailResult?.error?.code === "DB_WRITE_FAILED", dbFailResult);
  const dbFailKeys: string[] = dbFailResult?.cleanup?.deleted ?? [];
  const afterDbFail = await storageKeys();
  check("Đã xóa bù đủ 4 file vừa ghi, kho không còn file", dbFailKeys.length === 4 && dbFailKeys.every((k) => !afterDbFail.has(k)), dbFailResult?.cleanup);
  check("DB không có bản ghi của ảnh đó", dbFailKeys.length > 0 && (await prisma.photo.count({ where: { id: photoIdFromKey(dbFailKeys[0]!) } })) === 0);
  const editKeysBefore = await storageKeys();
  const editFail = await call("POST", `/api/admin/photos/${portrait.id}/edit`, { json: { baseVersion: portrait.version, rotate: 90 } });
  addEvidence("Response khi DB lỗi lúc lưu chỉnh sửa", editFail.body);
  const editFailDeleted: string[] = editFail.body?.error?.details?.cleanup?.deleted ?? [];
  check("Lưu chỉnh sửa khi DB lỗi: 500 DB_WRITE_FAILED", editFail.status === 500 && editFail.body?.error?.code === "DB_WRITE_FAILED", editFail.body);
  check(
    "File của version mới bị xóa bù, kho không đổi",
    editFailDeleted.length > 0 && editFailDeleted.every((k) => !k.includes(`/v${portrait.version}/`)) && (await storageKeys()).size === editKeysBefore.size,
    editFailDeleted,
  );
  const portraitAfter = await prisma.photo.findUnique({ where: { id: portrait.id }, select: { currentVersion: true } });
  check("Ảnh vẫn công bố version cũ", portraitAfter?.currentVersion === portrait.version, portraitAfter);

  section("DB lỗi và xóa bù cũng lỗi (FAULT_INJECTION=db-commit,cleanup-delete)");
  await startServer({ FAULT_INJECTION: "db-commit,cleanup-delete" });
  await login();
  const both = await call("POST", "/api/admin/photos", { form: form([["db-va-xoa-loi.jpg", fx.landscape]]) });
  const bothResult = both.body?.results?.[0];
  const queued: string[] = bothResult?.cleanup?.queued ?? [];
  addEvidence("Response khi DB lỗi và xóa bù cũng lỗi", bothResult);
  check("Key của file chưa xóa được đưa vào hàng đợi dọn", bothResult?.error?.code === "DB_WRITE_FAILED" && queued.length === 4, bothResult?.cleanup);
  const queuedRows = await prisma.storageCleanup.findMany({ where: { storageKey: { in: queued } } });
  check("Bảng storage_cleanups giữ đủ 4 key", queuedRows.length === 4, queuedRows.map((r) => r.storageKey));
  const orphanNow = await storageKeys();
  check("File mồ côi còn trong kho trước khi dọn", queued.every((k) => orphanNow.has(k)));
  addEvidence("storage_cleanups trước khi dọn", queuedRows.map((r) => ({ storage_key: r.storageKey, reason: r.reason, last_error: r.lastError })));

  // ── Xóa ảnh nhưng dọn file lỗi -> DELETING ──
  const stuckDel = await call("DELETE", `/api/admin/photos/${alpha.id}`);
  check("Xóa ảnh khi kho lỗi: 202, ảnh ở trạng thái DELETING", stuckDel.status === 202 && stuckDel.body.status === "DELETING", stuckDel.body);
  check("Ảnh DELETING không còn trong gallery", (await call("GET", `/api/photos/${alpha.id}`, { auth: false })).status === 404);

  section("Chạy lại tác vụ dọn sau khi kho hoạt động bình thường");
  await startServer();
  await login();
  const run = await call("POST", "/api/admin/cleanup");
  addEvidence("Kết quả POST /api/admin/cleanup", run.body);
  const afterCleanup = await storageKeys();
  check("Đã xóa các key trong hàng đợi", queued.every((k) => !afterCleanup.has(k)) && (await prisma.storageCleanup.count({ where: { storageKey: { in: queued } } })) === 0, run.body);
  check(
    "Ảnh DELETING được dọn xong: không còn file và bản ghi",
    keysOf(alpha).every((k) => !afterCleanup.has(k)) && (await prisma.photo.count({ where: { id: alpha.id } })) === 0,
    run.body,
  );
  created.splice(created.indexOf(alpha.id), 1);

  section("Ghi file vào kho lỗi giữa chừng (FAULT_INJECTION=storage-write)");
  await startServer({ FAULT_INJECTION: "storage-write" });
  await login();
  const keysBeforeWrite = await storageKeys();
  const writeFail = await call("POST", "/api/admin/photos", { form: form([["kho-loi.jpg", fx.landscape]]) });
  const wf = writeFail.body?.results?.[0];
  addEvidence("Response khi ghi file vào kho lỗi", wf);
  const afterWriteFail = await storageKeys();
  check("File bị từ chối với STORAGE_WRITE_FAILED", wf?.error?.code === "STORAGE_WRITE_FAILED", wf);
  check("Các variant đã ghi được xóa bù, kho không đổi", afterWriteFail.size === keysBeforeWrite.size && (wf?.cleanup?.deleted?.length ?? 0) === 4, wf?.cleanup);

  await startServer();
  await login();

  // ── Nhiều kho: admin chọn kho khi upload ──
  section(`Chọn kho khi upload (${registry.names.join(", ")}; mặc định ${registry.defaultName})`);
  const unknown = await call("POST", "/api/admin/photos", { form: form([["x.jpg", fx.landscape]], { storage: "khong-ton-tai" }) });
  check("Kho không có trong cấu hình: 400 UNKNOWN_STORAGE, không lưu gì", unknown.status === 400 && unknown.body?.error?.code === "UNKNOWN_STORAGE", unknown.body);
  check("Ảnh upload không chọn kho nằm ở kho mặc định", landscape.storage?.name === registry.defaultName, landscape.storage);
  for (const name of registry.names.filter((n) => n !== registry.defaultName)) {
    const before = await storageKeys(name);
    const res = await call("POST", "/api/admin/photos", {
      form: form([[`kho-${name}.jpg`, fx.exif]], { storage: name, items: JSON.stringify([{ title: `Thử kho ${name}`, altText: "Ảnh dọc có dải chữ TOP ở mép trên" }]) }),
    });
    const p = res.body?.results?.[0]?.photo as PhotoDto | undefined;
    check(`Upload vào kho "${name}": 201, photo.storage = ${name}`, res.status === 201 && p?.storage?.name === name, res.body?.results?.[0]?.error ?? p?.storage);
    if (!p) continue;
    created.push(p.id);
    const after = await storageKeys(name);
    const keys = keysOf(p);
    check(`File của ảnh nằm trong kho "${name}"`, keys.every((k) => after.has(k) && !before.has(k)), keys);
    const defaultKeys = await storageKeys();
    check("Kho mặc định không có file của ảnh này", keys.every((k) => !defaultKeys.has(k)));
    const media = await call("GET", p.variants[0]!.url, { auth: false });
    check(
      `Ảnh hiển thị từ kho "${name}": 200 image/webp`,
      media.status === 200 && media.headers.get("content-type") === "image/webp",
      { url: p.variants[0]!.url, status: media.status, type: media.headers.get("content-type") },
    );
    let dl = await call("GET", p.original.downloadUrl, { auth: false });
    const loc = dl.status === 302 ? dl.headers.get("location") : null;
    if (loc) dl = await call("GET", loc, { auth: false });
    check(`Tải bản gốc từ kho "${name}"`, dl.status === 200 && (dl.headers.get("content-disposition") ?? "").startsWith("attachment;"), {
      status: dl.status,
      via: loc ? new URL(loc).host : "proxy",
    });
    addEvidence(`Upload vào kho ${name}`, { storage: p.storage, variants: p.variants.map((v) => v.url), original: p.original.storageKey });
    const ed = await call("POST", `/api/admin/photos/${p.id}/edit`, { json: { baseVersion: 1, rotate: 90 } });
    const edKeys: string[] = (ed.body?.photo?.variants ?? []).map((v: { storageKey: string }) => v.storageKey);
    const afterEdit = await storageKeys(name);
    check(
      `Chỉnh sửa ảnh trong kho "${name}": 201, file v2 nằm trong kho đó`,
      ed.status === 201 && edKeys.length > 0 && edKeys.every((k) => k.includes("/v2/") && afterEdit.has(k)),
      ed.body?.error ?? edKeys,
    );
    if (ed.status === 201) keys.push(...edKeys);
    const del = await call("DELETE", `/api/admin/photos/${p.id}`);
    const afterDel = await storageKeys(name);
    check(`Xóa ảnh dọn sạch file trong kho "${name}"`, del.status === 200 && keys.every((k) => !afterDel.has(k)), del.body);
    created.splice(created.indexOf(p.id), 1);
  }
}

// ───────────────────────── bonus: chỉnh sửa ảnh ─────────────────────────

async function editScenario() {
  section("Bonus: chỉnh sửa ảnh (cắt, xoay, lật, khôi phục, version)");
  const up = await call("POST", "/api/admin/photos", {
    form: form([["chinh-sua.jpg", fx.landscape]], { items: JSON.stringify([{ title: "Ảnh để chỉnh sửa", altText: "Ảnh ngang dùng thử chỉnh sửa" }]) }),
  });
  const p0 = up.body?.results?.[0]?.photo as PhotoDto | undefined;
  if (!p0) {
    check("Upload ảnh để chỉnh sửa", false, up.body);
    return;
  }
  created.push(p0.id);
  const id = p0.id;
  const v1Keys = p0.variants.map((v) => v.storageKey);

  const src = await call("GET", `/api/admin/photos/${id}/source?max=800`);
  const srcMeta = src.status === 200 ? await sharp(src.buffer).metadata() : null;
  check(
    "Bản xem trước cho trình chỉnh sửa: WebP thu nhỏ từ bản gốc, Cache-Control private",
    src.status === 200 && src.headers.get("content-type") === "image/webp" && src.headers.get("cache-control") === "private, no-store" && srcMeta?.width === 800,
    [src.status, src.headers.get("content-type"), srcMeta?.width],
  );
  check("Khách không gọi được API chỉnh sửa (401)", (await call("POST", `/api/admin/photos/${id}/edit`, { json: { baseVersion: 1, rotate: 90 }, auth: false })).status === 401);

  // Request không hợp lệ: ảnh đang công bố không đổi
  const keysBefore = await storageKeys();
  const outside = await call("POST", `/api/admin/photos/${id}/edit`, { json: { baseVersion: 1, crop: { x: 2000, y: 0, width: 600, height: 400 }, rotate: 0, flipH: false } });
  check("Vùng cắt ra ngoài ảnh: 422 INVALID_EDIT", outside.status === 422 && outside.body?.error?.code === "INVALID_EDIT", outside.body);
  addEvidence("Response khi vùng cắt nằm ngoài ảnh", outside.body);
  const badAngle = await call("POST", `/api/admin/photos/${id}/edit`, { json: { baseVersion: 1, rotate: 45 } });
  check("Góc xoay 45°: 422 INVALID_EDIT", badAngle.status === 422 && badAngle.body?.error?.code === "INVALID_EDIT", badAngle.body);
  const badFlip = await call("POST", `/api/admin/photos/${id}/edit`, { json: { baseVersion: 1, flipH: "yes" } });
  check("flipH không phải boolean: 400", badFlip.status === 400, badFlip.body);
  const stale = await call("POST", `/api/admin/photos/${id}/edit`, { json: { baseVersion: 7, rotate: 90 } });
  check("baseVersion cũ: 409 VERSION_CONFLICT", stale.status === 409 && stale.body?.error?.code === "VERSION_CONFLICT", stale.body);
  const unchanged = await prisma.photo.findUnique({ where: { id }, select: { currentVersion: true } });
  check("Request sai không đổi ảnh đang công bố, không ghi file", unchanged?.currentVersion === 1 && (await storageKeys()).size === keysBefore.size);

  // Lưu hợp lệ: cắt 1200x900 tại (400,200) -> xoay 90 -> lật ngang
  const crop = { x: 400, y: 200, width: 1200, height: 900 };
  const e2 = await call("POST", `/api/admin/photos/${id}/edit`, { json: { baseVersion: 1, crop, rotate: 90, flipH: true } });
  addEvidence("Response lưu chỉnh sửa (v1 -> v2)", {
    status: e2.status,
    version: e2.body?.version,
    oldFilesDeleteAfter: e2.body?.oldFilesDeleteAfter,
    edit: e2.body?.photo?.edit,
    variants: e2.body?.photo?.variants?.map((v: { width: number; height: number; storageKey: string }) => `${v.width}x${v.height} ${v.storageKey}`),
  });
  const p2 = e2.body?.photo as PhotoDto | undefined;
  check("Lưu chỉnh sửa: 201, version 2", e2.status === 201 && e2.body?.version === 2 && p2?.version === 2, e2.body?.error ?? e2.body?.version);
  if (!p2) return;
  check("Kích thước sau cắt và xoay 90°: 900x1200", p2.width === 900 && p2.height === 1200, [p2.width, p2.height]);
  check(
    "Variant mới nằm dưới photos/<id>/v2/, không phóng lớn (320, 900)",
    p2.variants.every((v) => v.storageKey.startsWith(`photos/${id}/v2/`)) && p2.variants.map((v) => v.width).join() === "320,900",
    p2.variants.map((v) => v.storageKey),
  );
  check("Bản gốc không đổi (2400x1600, cùng key)", p2.original.storageKey === p0.original.storageKey && p2.original.width === 2400 && p2.original.height === 1600);
  const after2 = await storageKeys();
  check("File v1 vẫn còn trong kho (browser/CDN có thể còn cache URL cũ)", v1Keys.every((k) => after2.has(k)));
  const big = await call("GET", p2.variants.at(-1)!.url, { auth: false });
  const bigMeta = await sharp(big.buffer).metadata();
  check(
    "Variant v2 là WebP 900x1200, không EXIF, Cache-Control immutable",
    big.status === 200 && bigMeta.format === "webp" && bigMeta.width === 900 && bigMeta.height === 1200 && !bigMeta.exif && big.headers.get("cache-control") === IMMUTABLE,
    [big.status, bigMeta.width, bigMeta.height, big.headers.get("cache-control")],
  );
  // Tham chiếu độc lập: cắt, lật rồi xoay 270 (= xoay 90 rồi lật) bằng sharp trên file gửi lên
  // (không resize trong cùng pipeline: sharp resize trước khi xoay; ảnh đã đúng 900px)
  const expected = await sharp(fx.landscape).extract({ left: crop.x, top: crop.y, width: crop.width, height: crop.height }).flop().rotate(270).removeAlpha().raw().toBuffer();
  const actual = await sharp(big.buffer).removeAlpha().raw().toBuffer();
  const diff = meanAbsDiff(expected, actual);
  check("Nội dung variant khớp phép cắt -> xoay -> lật tính từ bản gốc (sai khác trung bình < 6/255)", diff < 6, Math.round(diff * 10) / 10);
  const pub = await call("GET", `/api/photos/${id}`, { auth: false });
  check("Gallery công khai trả srcset của v2", pub.status === 200 && pub.body.version === 2 && pub.body.srcSet.includes("/v2/") && !pub.body.srcSet.includes("/v1/"), pub.body?.srcSet);
  const versions = await prisma.photoVersion.findMany({ where: { photoId: id }, orderBy: { version: "asc" } });
  check(
    "DB: PhotoVersion v1 bị thay thế (superseded_at), v2 đang công bố kèm thông số",
    versions.length === 2 && versions[0]!.supersededAt !== null && versions[1]!.supersededAt === null && versions[1]!.cropX === 400 && versions[1]!.rotate === 90 && versions[1]!.flipH,
    versions.map((v) => ({ v: v.version, superseded: v.supersededAt, crop: [v.cropX, v.cropY, v.cropWidth, v.cropHeight], rotate: v.rotate, flipH: v.flipH })),
  );

  const same = await call("POST", `/api/admin/photos/${id}/edit`, { json: { baseVersion: 2, crop, rotate: 90, flipH: true } });
  check("Gửi lại đúng thông số đang công bố: 200, không tạo version", same.status === 200 && same.body?.changed === false && same.body?.version === 2, same.body?.version);

  // Hai lần lưu đồng thời từ cùng v2: đúng một lần thắng, file của lần thua bị xóa bù
  const keysBeforeRace = await storageKeys();
  const [ra, rb] = await Promise.all([
    call("POST", `/api/admin/photos/${id}/edit`, { json: { baseVersion: 2, rotate: 180 } }),
    call("POST", `/api/admin/photos/${id}/edit`, { json: { baseVersion: 2, rotate: 0, flipH: true } }),
  ]);
  const statuses = [ra.status, rb.status].sort().join();
  check("Hai lần lưu đồng thời từ cùng version: một 201, một 409", statuses === "201,409", [ra.status, rb.status, ra.body?.error ?? rb.body?.error]);
  const winner = (ra.status === 201 ? ra : rb).body?.photo as PhotoDto | undefined;
  const afterRace = await storageKeys();
  const raceNew = [...afterRace].filter((k) => !keysBeforeRace.has(k));
  check(
    "Kho chỉ thêm file của lần thắng",
    winner !== undefined && raceNew.length === winner.variants.length && raceNew.every((k) => k.startsWith(`photos/${id}/v${winner.version}/`)),
    { winnerVersion: winner?.version, raceNew },
  );
  addEvidence("Hai lần lưu đồng thời", { statuses: [ra.status, rb.status], loser: (ra.status === 409 ? ra : rb).body });

  // Khôi phục: bỏ mọi chỉnh sửa, sinh lại variant từ bản gốc
  const cur = winner?.version ?? 2;
  const rs = await call("POST", `/api/admin/photos/${id}/edit`, { json: { baseVersion: cur, restore: true, rotate: 90, crop } });
  const pr = rs.body?.photo as PhotoDto | undefined;
  check(
    "Khôi phục (bỏ qua crop/rotate gửi kèm): 201, ảnh 2400x1600, variant 320/960/1600",
    rs.status === 201 &&
      pr?.width === 2400 &&
      pr.height === 1600 &&
      pr.variants.map((v) => v.width).join() === "320,960,1600" &&
      pr.variants.every((v) => v.storageKey.includes(`/v${pr.version}/`)) &&
      pr.version > cur,
    rs.body?.error ?? [pr?.width, pr?.height, pr?.variants?.map((v) => v.storageKey)],
  );
  if (!pr) return;
  const restoredDb = await prisma.photoVersion.findFirst({ where: { photoId: id, supersededAt: null } });
  check("DB: version khôi phục không có thông số chỉnh sửa", restoredDb?.version === pr.version && restoredDb.cropX === null && restoredDb.rotate === 0 && !restoredDb.flipH, restoredDb);
  const oldKeys = (await prisma.photoVariant.findMany({ where: { photoId: id, version: { not: pr.version } } })).map((v) => v.storageKey);
  const beforeClean = await storageKeys();
  check("Trong thời hạn giữ: còn file và PhotoVariant của các version cũ", oldKeys.length > 0 && oldKeys.every((k) => beforeClean.has(k)), oldKeys.length);

  // Hết thời hạn giữ (VERSION_RETENTION_HOURS=0): tác vụ dọn xóa file + PhotoVariant của version cũ
  section("Bonus: dọn version cũ khi hết thời hạn giữ (VERSION_RETENTION_HOURS=0)");
  await startServer({ VERSION_RETENTION_HOURS: "0" });
  await login();
  const run = await call("POST", "/api/admin/cleanup");
  addEvidence("Kết quả dọn version cũ", run.body);
  const afterClean = await storageKeys();
  check("Tác vụ dọn báo đã dọn version cũ", (run.body?.summary?.oldVersionsCleaned ?? 0) >= 1, run.body?.summary);
  check("Kho không còn file của version cũ", oldKeys.every((k) => !afterClean.has(k)), oldKeys.filter((k) => afterClean.has(k)));
  check("Kho vẫn còn đủ file của version đang công bố và bản gốc", keysOf(pr).every((k) => afterClean.has(k)));
  const leftVariants = await prisma.photoVariant.findMany({ where: { photoId: id } });
  const oldRows = await prisma.photoVersion.findMany({ where: { photoId: id, supersededAt: { not: null } } });
  check(
    "DB: chỉ còn PhotoVariant của version đang công bố; PhotoVersion cũ có files_cleaned_at",
    leftVariants.every((v) => v.version === pr.version) && oldRows.length >= 2 && oldRows.every((r) => r.filesCleanedAt !== null),
    { variants: leftVariants.map((v) => v.version), old: oldRows.map((r) => [r.version, r.filesCleanedAt]) },
  );
  const gone = await call("GET", `/media/${oldKeys[0]}`, { auth: false });
  check("URL /media của version cũ trả 404 khi gửi request mới tới origin", gone.status === 404, gone.status);

  // Xóa ảnh có nhiều version: dọn sạch mọi file
  const e5 = await call("POST", `/api/admin/photos/${id}/edit`, { json: { baseVersion: pr.version, rotate: 270 } });
  const p5 = e5.body?.photo as PhotoDto | undefined;
  const allKeys = (await prisma.photoVariant.findMany({ where: { photoId: id } })).map((v) => v.storageKey).concat(p0.original.storageKey);
  const del = await call("DELETE", `/api/admin/photos/${id}`);
  const afterDel = await storageKeys();
  check(
    "Xóa ảnh đã chỉnh sửa: xóa file mọi version còn giữ và bản gốc, DB không còn bản ghi",
    p5 !== undefined &&
      del.status === 200 &&
      allKeys.length > keysOf(p5).length - 1 &&
      allKeys.every((k) => !afterDel.has(k)) &&
      (await prisma.photo.count({ where: { id } })) === 0 &&
      (await prisma.photoVersion.count({ where: { photoId: id } })) === 0,
    { del: del.body, keys: allKeys.length },
  );
  if (del.status === 200) created.splice(created.indexOf(id), 1);

  await startServer();
  await login();
}

function meanAbsDiff(a: Buffer, b: Buffer): number {
  if (a.length !== b.length) return 255;
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i]! - b[i]!);
  return sum / a.length;
}

interface PhotoDto {
  id: string;
  version: number;
  width: number;
  height: number;
  altText: string;
  srcSet: string;
  storage: { name: string; label: string };
  variants: { width: number; height: number; bytes: number; url: string; storageKey: string }[];
  original: { storageKey: string; downloadUrl: string; bytes: number; width: number; height: number };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function summarizeUpload(body: any) {
  if (!body?.results) return body;
  return {
    summary: body.summary,
    limits: body.limits,
    results: body.results.map((r: { index: number; filename: string; ok: boolean; photo?: PhotoDto; error?: unknown; cleanup?: unknown }) =>
      r.ok
        ? {
            index: r.index,
            filename: r.filename,
            ok: true,
            photoId: r.photo!.id,
            size: `${r.photo!.width}x${r.photo!.height}`,
            variants: r.photo!.variants.map((v) => `${v.width}x${v.height} ${v.bytes}B ${v.storageKey}`),
            original: `${r.photo!.original.bytes}B ${r.photo!.original.storageKey}`,
          }
        : { index: r.index, filename: r.filename, ok: false, error: r.error, ...(r.cleanup ? { cleanup: r.cleanup } : {}) },
    ),
  };
}

async function writeReport(error?: unknown) {
  const counted = checks.filter((c) => !c.skipped);
  const passed = counted.filter((c) => c.ok).length;
  const skippedCount = checks.length - counted.length;
  const lines = [
    "# Nghiệm thu Photo Gallery (Block 11)",
    "",
    `- Thời điểm: ${new Date().toISOString()}`,
    `- Kho mặc định: \`${registry.defaultName}\` \`${JSON.stringify(storage.describe())}\``,
    `- Các kho: ${registry.info().map((s) => `${s.name} (${s.label})`).join(", ")}`,
    `- Giới hạn: ${config.upload.maxFiles} file/request, ${config.upload.maxFileBytes / MiB} MiB/file, ${config.upload.maxRequestBytes / MiB} MiB/request, ${config.upload.maxPixels.toLocaleString("en-US")} pixel`,
    `- Variant: ${config.upload.variants.map((v) => `${v.width}px q${v.quality}`).join(", ")}`,
    `- Kết quả: **${passed}/${counted.length}** kiểm tra đạt${skippedCount ? `, ${skippedCount} bỏ qua (không áp dụng với cấu hình này)` : ""}${error ? ` - dừng sớm vì lỗi: ${String(error)}` : ""}`,
    "",
  ];
  let current = "";
  for (const c of checks) {
    if (c.group !== current) {
      current = c.group;
      lines.push(`## ${current}`, "");
    }
    if (c.skipped) {
      lines.push(`- ⏭️ ${c.name} - bỏ qua: ${String(c.detail)}`);
      continue;
    }
    lines.push(`- ${c.ok ? "✅" : "❌"} ${c.name}${c.ok || c.detail === undefined ? "" : ` - \`${JSON.stringify(c.detail).slice(0, 300)}\``}`);
  }
  lines.push("", "## Bằng chứng", "");
  for (const e of evidence) lines.push(`### ${e.title}`, "", "```json", e.body, "```", "");
  await fs.writeFile(path.join(OUT_DIR, "report.md"), lines.join("\n"));
  await fs.writeFile(path.join(OUT_DIR, "report.json"), JSON.stringify({ checks, evidence }, null, 2));
  console.log(`\n${passed}/${counted.length} kiểm tra đạt${skippedCount ? `, ${skippedCount} bỏ qua` : ""}. Báo cáo: ${path.join(OUT_DIR, "report.md")}`);
  return passed === counted.length && !error;
}

let failure: unknown;
try {
  await main();
} catch (err) {
  failure = err;
  console.error("\nNghiệm thu dừng vì lỗi:", err);
  if (serverLog) console.error("Log server:\n" + serverLog.slice(-3000));
}
try {
  if (CLEAN && (created.length || createdAlbums.length)) {
    await login().catch(() => {});
    for (const id of created) await call("DELETE", `/api/admin/photos/${id}`);
    for (const id of createdAlbums) await call("DELETE", `/api/admin/albums/${id}`);
    console.log(`Đã xóa ${created.length} ảnh và ${createdAlbums.length} album do script tạo`);
  }
} finally {
  await stopServer();
  const ok = await writeReport(failure);
  await disconnectPrisma();
  process.exit(ok ? 0 : 1);
}
