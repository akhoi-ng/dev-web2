import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isMediaKey, isValidKey, joinUrl, originalKey, variantKey } from "../src/storage/keys.js";
import { LocalStorage } from "../src/storage/local.js";

describe("storage keys", () => {
  const id = randomUUID();
  it("tạo key theo quy ước photos/<id>/v<version>/<width>.webp", () => {
    expect(variantKey(id, 1, 960)).toBe(`photos/${id}/v1/960.webp`);
    expect(originalKey(id, "jpg")).toBe(`photos/${id}/original.jpg`);
  });
  it("từ chối key lạ, path traversal và tên người dùng", () => {
    for (const bad of [
      "../etc/passwd",
      `photos/${id}/../../secret.webp`,
      `photos/${id}/v1/960.webp/../x`,
      `photos/not-a-uuid/v1/960.webp`,
      `photos/${id}/v0/960.webp`,
      `photos/${id}/v1/bo-bien.jpg`,
      `/photos/${id}/v1/960.webp`,
      `photos\\${id}\\v1\\960.webp`,
    ]) {
      expect(isValidKey(bad), bad).toBe(false);
    }
  });
  it("chỉ variant WebP là media công khai; bản gốc thì không", () => {
    expect(isMediaKey(variantKey(id, 2, 320))).toBe(true);
    expect(isMediaKey(originalKey(id, "png"))).toBe(false);
  });
  it("ghép URL công khai từ tiền tố", () => {
    expect(joinUrl("https://cdn.example.com/", `photos/${id}/v1/320.webp`)).toBe(`https://cdn.example.com/photos/${id}/v1/320.webp`);
  });
});

describe("LocalStorage", () => {
  let root: string;
  let storage: LocalStorage;
  const id = randomUUID();

  beforeAll(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "gallery-test-"));
    storage = new LocalStorage(root);
    await storage.init();
  });
  afterAll(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("ghi, đọc, liệt kê theo key", async () => {
    const key = variantKey(id, 1, 320);
    await storage.put(key, Buffer.from("webp-bytes"), { contentType: "image/webp" });
    expect(await storage.exists(key)).toBe(true);
    expect(await fs.readFile(path.join(root, "photos", id, "v1", "320.webp"), "utf8")).toBe("webp-bytes");
    const listed = [];
    for await (const obj of storage.list("photos/")) listed.push(obj);
    expect(listed).toEqual([{ key, bytes: 10 }]);
  });

  it("xóa idempotent và dọn thư mục rỗng", async () => {
    const key = variantKey(id, 1, 320);
    await storage.delete(key);
    await storage.delete(key);
    expect(await storage.exists(key)).toBe(false);
    await expect(fs.access(path.join(root, "photos", id))).rejects.toThrow();
    await expect(fs.access(root)).resolves.toBeUndefined();
  });

  it("không cho key thoát khỏi thư mục gốc", () => {
    expect(() => storage.localPath("../outside.webp")).toThrow();
  });

  it("kiểm tra kết nối ghi-đọc-xóa", async () => {
    const steps = await storage.test();
    expect(steps.every((s) => s.ok)).toBe(true);
    const left = [];
    for await (const obj of storage.list("")) left.push(obj);
    expect(left).toEqual([]);
  });
});
