import { describe, expect, it } from "vitest";
import { readConfig } from "../src/config.js";
import { Semaphore } from "../src/util/semaphore.js";
import { contentDisposition, normalizeTags, sanitizeFilename, slugify, titleFromFilename } from "../src/util/text.js";

describe("text helpers", () => {
  it("slugify bỏ dấu tiếng Việt", () => {
    expect(slugify("Bờ biển Đà Nẵng lúc chiều!")).toBe("bo-bien-da-nang-luc-chieu");
    expect(slugify("***")).toBe("");
  });
  it("sanitizeFilename bỏ thư mục và ký tự nguy hiểm", () => {
    expect(sanitizeFilename("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFilename("C:\\Users\\a\\ảnh<1>.jpg")).toBe("ảnh1.jpg");
    expect(sanitizeFilename("")).toBe("unnamed");
    expect(sanitizeFilename("..")).toBe("unnamed");
  });
  it("titleFromFilename", () => {
    expect(titleFromFilename("bo_bien-da-nang.jpg")).toBe("Bo bien da nang");
  });
  it("normalizeTags bỏ trùng, chữ thường, tối đa 10", () => {
    expect(normalizeTags(" Biển, biển ,Hoàng hôn,, ")).toEqual(["biển", "hoàng hôn"]);
    expect(normalizeTags(Array.from({ length: 15 }, (_, i) => `t${i}`))).toHaveLength(10);
  });
  it("contentDisposition có tên ASCII và tên UTF-8", () => {
    expect(contentDisposition("attachment", "bờ biển.jpg")).toBe(`attachment; filename="bo bien.jpg"; filename*=UTF-8''b%E1%BB%9D%20bi%E1%BB%83n.jpg`);
  });
});

describe("Semaphore", () => {
  it("không vượt quá giới hạn chạy đồng thời", async () => {
    const sem = new Semaphore(2);
    let active = 0;
    let peak = 0;
    const task = () =>
      sem.run(async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 5));
        active--;
      });
    await Promise.all(Array.from({ length: 10 }, task));
    expect(peak).toBe(2);
  });
});

describe("readConfig", () => {
  const base = { JWT_SECRET: "x".repeat(32), LOCAL_STORAGE_ROOT: process.platform === "win32" ? "D:\\gallery-data" : "/srv/gallery" };
  it("mặc định theo đề: 5 file, 10 MiB, 55 MiB, 40 triệu pixel, 320/960/1600", () => {
    const c = readConfig(base);
    expect(c.upload).toMatchObject({ maxFiles: 5, maxFileBytes: 10 * 1024 * 1024, maxRequestBytes: 55 * 1024 * 1024, maxPixels: 40_000_000 });
    expect(c.upload.variants.map((v) => v.width)).toEqual([320, 960, 1600]);
  });
  it("bắt buộc đường dẫn tuyệt đối cho local storage", () => {
    expect(() => readConfig({ JWT_SECRET: "x".repeat(32) })).toThrow(/LOCAL_STORAGE_ROOT/);
    expect(() => readConfig({ ...base, LOCAL_STORAGE_ROOT: "./uploads" })).toThrow(/tuyệt đối/);
  });
  it("SeaweedFS mặc định path-style; R2 region auto", () => {
    const sw = readConfig({ ...base, STORAGE_DRIVER: "s3", S3_ENDPOINT: "http://10.0.0.5:8333", S3_BUCKET: "b", S3_ACCESS_KEY_ID: "k", S3_SECRET_ACCESS_KEY: "s" });
    const swStore = sw.storages[0]!;
    expect(swStore.driver === "s3" && swStore.s3.forcePathStyle).toBe(true);
    const r2 = readConfig({ ...base, STORAGE_DRIVER: "s3", S3_PROVIDER: "r2", S3_ENDPOINT: "https://acc.r2.cloudflarestorage.com", S3_BUCKET: "b", S3_ACCESS_KEY_ID: "k", S3_SECRET_ACCESS_KEY: "s" });
    const r2Store = r2.storages[0]!;
    expect(r2Store.driver === "s3" && [r2Store.s3.region, r2Store.s3.forcePathStyle]).toEqual(["auto", false]);
    expect([r2.defaultStorage, r2Store.name]).toEqual(["default", "default"]);
  });

  it("nhiều kho theo STORAGE_PROFILES, kho mặc định do STORAGE_DEFAULT chọn", () => {
    const c = readConfig({
      JWT_SECRET: "x".repeat(32),
      STORAGE_PROFILES: "r2, seaweedfs",
      STORAGE_DEFAULT: "r2",
      R2_DRIVER: "s3",
      R2_PROVIDER: "r2",
      R2_ENDPOINT: "https://acc.r2.cloudflarestorage.com",
      R2_BUCKET: "gallery",
      R2_ACCESS_KEY_ID: "k",
      R2_SECRET_ACCESS_KEY: "s",
      R2_PUBLIC_BASE_URL: "https://cdn-r2.example.com/",
      R2_DOWNLOAD_MODE: "presigned",
      SEAWEEDFS_DRIVER: "s3",
      SEAWEEDFS_ENDPOINT: "https://cdn.example.com",
      SEAWEEDFS_BUCKET: "cdn",
      SEAWEEDFS_ACCESS_KEY_ID: "k2",
      SEAWEEDFS_SECRET_ACCESS_KEY: "s2",
      SEAWEEDFS_LABEL: "SeaweedFS VPS",
    });
    expect(c.defaultStorage).toBe("r2");
    expect(c.storages.map((s) => [s.name, s.label, s.downloadMode])).toEqual([
      ["r2", "Cloudflare R2", "presigned"],
      ["seaweedfs", "SeaweedFS VPS", "proxy"],
    ]);
    const [r2, sw] = c.storages;
    expect(r2?.driver === "s3" && r2.s3.publicBaseUrl).toBe("https://cdn-r2.example.com");
    expect(sw?.driver === "s3" && [sw.s3.provider, sw.s3.forcePathStyle, sw.s3.region]).toEqual(["seaweedfs", true, "us-east-1"]);
  });

  it("báo lỗi rõ khi kho thiếu biến hoặc STORAGE_DEFAULT sai", () => {
    expect(() => readConfig({ JWT_SECRET: "x".repeat(32), STORAGE_PROFILES: "r2", R2_DRIVER: "s3", R2_PROVIDER: "r2" })).toThrow(/R2_BUCKET.*\n.*R2_ACCESS_KEY_ID[\s\S]*R2_ENDPOINT/);
    expect(() =>
      readConfig({ JWT_SECRET: "x".repeat(32), STORAGE_PROFILES: "a", STORAGE_DEFAULT: "b", A_DRIVER: "local", A_ROOT: process.platform === "win32" ? "D:\\x" : "/x" }),
    ).toThrow(/STORAGE_DEFAULT/);
    expect(() => readConfig({ JWT_SECRET: "x".repeat(32), STORAGE_PROFILES: "Bad Name" })).toThrow(/không hợp lệ/);
  });
  it("bỏ qua FAULT_INJECTION trên production", () => {
    expect(readConfig({ ...base, FAULT_INJECTION: "db-commit" }).faults.has("db-commit")).toBe(true);
    expect(readConfig({ ...base, NODE_ENV: "production", FAULT_INJECTION: "db-commit" }).faults.size).toBe(0);
    expect(() => readConfig({ ...base, FAULT_INJECTION: "nope" })).toThrow();
  });
});
