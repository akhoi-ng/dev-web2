import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { assertKey, healthcheckKey } from "./keys.js";
import type { ObjectInfo, PutOptions, StorageDriver, StoredObject, TestStep } from "./types.js";
import { timed } from "./timed.js";

/**
 * Lưu ảnh trên ổ đĩa của web server. Thư mục gốc nằm ngoài source code (LOCAL_STORAGE_ROOT), trên ổ
 * đĩa bền vững hoặc volume của container, nên file vẫn còn sau khi restart hoặc thay bản build.
 * Storage key được ánh xạ vào thư mục gốc; key không hợp lệ hoặc thoát ra ngoài gốc bị từ chối.
 */
export class LocalStorage implements StorageDriver {
  readonly kind = "local" as const;
  private readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  async init(): Promise<void> {
    await fs.mkdir(this.root, { recursive: true });
  }

  describe() {
    return { driver: "local", root: this.root };
  }

  localPath(key: string): string {
    assertKey(key);
    const full = path.resolve(this.root, ...key.split("/"));
    if (!full.startsWith(this.root + path.sep)) throw new Error(`Key thoát khỏi thư mục gốc: ${key}`);
    return full;
  }

  async put(key: string, body: Buffer, _options: PutOptions): Promise<void> {
    const target = this.localPath(key);
    await fs.mkdir(path.dirname(target), { recursive: true });
    // Ghi ra file tạm rồi rename: người xem không bao giờ đọc được file ghi dở
    const tmp = `${target}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(tmp, body, { flag: "wx" });
      await fs.rename(tmp, target);
    } catch (err) {
      await fs.rm(tmp, { force: true }).catch(() => {});
      throw err;
    }
  }

  async get(key: string, options?: { ifNoneMatch?: string }): Promise<StoredObject | "not-modified" | null> {
    const file = this.localPath(key);
    let stat;
    try {
      stat = await fs.stat(file);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
    const etag = `"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
    if (options?.ifNoneMatch && options.ifNoneMatch === etag) return "not-modified";
    return { body: createReadStream(file), contentLength: stat.size, etag, lastModified: stat.mtime };
  }

  async delete(key: string): Promise<void> {
    const file = this.localPath(key);
    await fs.rm(file, { force: true });
    // Dọn thư mục rỗng (photos/<id>/v1, photos/<id>) để kho không còn dấu vết của ảnh đã xóa
    let dir = path.dirname(file);
    while (dir.startsWith(this.root + path.sep)) {
      try {
        await fs.rmdir(dir);
      } catch {
        break; // còn file khác hoặc đã bị xóa
      }
      dir = path.dirname(dir);
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(this.localPath(key));
      return true;
    } catch {
      return false;
    }
  }

  async *list(prefix: string): AsyncIterable<ObjectInfo> {
    const start = path.resolve(this.root, ...prefix.split("/").filter(Boolean));
    if (start !== this.root && !start.startsWith(this.root + path.sep)) return;
    let entries;
    try {
      entries = await fs.readdir(start, { recursive: true, withFileTypes: true });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
      throw err;
    }
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const full = path.join(entry.parentPath, entry.name);
      const key = path.relative(this.root, full).split(path.sep).join("/");
      const stat = await fs.stat(full);
      yield { key, bytes: stat.size };
    }
  }

  directPublicUrl(): string | null {
    return null; // web server là origin: /media/<key>
  }

  async test(): Promise<TestStep[]> {
    const key = healthcheckKey(randomUUID());
    const payload = Buffer.from(`photo-gallery healthcheck ${new Date().toISOString()}`);
    const steps: TestStep[] = [];
    steps.push(await timed("Ghi file thử", () => this.put(key, payload, { contentType: "text/plain" })));
    if (steps.at(-1)!.ok) {
      steps.push(
        await timed("Đọc lại và so sánh nội dung", async () => {
          const data = await fs.readFile(this.localPath(key));
          if (!data.equals(payload)) throw new Error("Nội dung đọc lại khác nội dung đã ghi");
        }),
      );
      steps.push(await timed("Xóa file thử", () => this.delete(key)));
      steps.push(
        await timed("Xác nhận đã xóa", async () => {
          if (await this.exists(key)) throw new Error("File vẫn còn sau khi xóa");
        }),
      );
    }
    return steps;
  }
}
