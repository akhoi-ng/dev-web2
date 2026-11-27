import path from "node:path";
import type { Config, Fault, StorageProfile } from "../config.js";
import { SERVER_ROOT } from "../config.js";
import { log } from "../log.js";
import { LocalStorage } from "./local.js";
import { S3Storage } from "./s3.js";
import type { StorageDriver } from "./types.js";

export type { StorageDriver } from "./types.js";

export interface StorageInfo {
  name: string;
  label: string;
  isDefault: boolean;
  downloadMode: "proxy" | "presigned";
  publicBaseUrl: string | null;
  details: Record<string, string | boolean | null>;
}

/**
 * Các kho lưu ảnh có tên, tạo một lần lúc khởi động. Mỗi Photo ghi tên kho của nó (cột `storage`),
 * nên đọc/xóa luôn đi đúng kho dù admin upload ảnh vào nhiều kho khác nhau.
 */
export class StorageRegistry {
  constructor(
    private readonly drivers: Map<string, { driver: StorageDriver; profile: StorageProfile }>,
    readonly defaultName: string,
  ) {}

  get names(): string[] {
    return [...this.drivers.keys()];
  }

  has(name: string): boolean {
    return this.drivers.has(name);
  }

  /** Driver của kho; ném lỗi nếu kho không được cấu hình. */
  get(name: string): StorageDriver {
    const entry = this.drivers.get(name);
    if (!entry) throw new Error(`Kho "${name}" không có trong STORAGE_PROFILES`);
    return entry.driver;
  }

  tryGet(name: string): StorageDriver | undefined {
    return this.drivers.get(name)?.driver;
  }

  get default(): StorageDriver {
    return this.get(this.defaultName);
  }

  profile(name: string): StorageProfile | undefined {
    return this.drivers.get(name)?.profile;
  }

  /** Mô tả an toàn (không có secret) để hiển thị trong Admin. */
  info(): StorageInfo[] {
    return [...this.drivers.values()].map(({ driver, profile }) => ({
      name: profile.name,
      label: profile.label,
      isDefault: profile.name === this.defaultName,
      downloadMode: profile.downloadMode,
      publicBaseUrl: profile.driver === "s3" ? (profile.s3.publicBaseUrl ?? null) : null,
      details: driver.describe(),
    }));
  }
}

export async function createStorageRegistry(config: Config): Promise<StorageRegistry> {
  const drivers = new Map<string, { driver: StorageDriver; profile: StorageProfile }>();
  for (const profile of config.storages) {
    let driver: StorageDriver;
    if (profile.driver === "local") {
      const repoRoot = path.resolve(SERVER_ROOT, "..");
      if (profile.root === repoRoot || profile.root.startsWith(repoRoot + path.sep)) {
        log.warn("Thư mục lưu ảnh nằm trong source code; nên đặt ra ngoài để không mất ảnh khi deploy lại", { storage: profile.name, root: profile.root });
      }
      const local = new LocalStorage(profile.root);
      await local.init();
      driver = local;
    } else {
      driver = new S3Storage(profile.s3);
    }
    drivers.set(profile.name, { driver: config.faults.size > 0 ? withFaults(driver, config.faults) : driver, profile });
  }
  if (config.faults.size > 0) log.warn("FAULT_INJECTION đang bật, chỉ dùng để nghiệm thu", { faults: [...config.faults] });
  return new StorageRegistry(drivers, config.defaultStorage);
}

/**
 * Giả lập lỗi để nghiệm thu luồng bù trừ (FAULT_INJECTION, bị bỏ qua khi NODE_ENV=production):
 *   storage-write  : ghi bản gốc thất bại -> các variant đã ghi phải bị xóa
 *   cleanup-delete : mọi thao tác xóa thất bại -> key được lưu vào bảng storage_cleanups để dọn lại
 */
function withFaults(inner: StorageDriver, faults: Set<Fault>): StorageDriver {
  const proxy: StorageDriver = Object.create(inner);
  if (faults.has("storage-write")) {
    proxy.put = async (key, body, options) => {
      if (/\/original\.(jpg|png)$/.test(key)) throw new Error(`[FAULT_INJECTION storage-write] Không ghi được ${key}`);
      return inner.put(key, body, options);
    };
  }
  if (faults.has("cleanup-delete")) {
    proxy.delete = async (key) => {
      if (key.startsWith("photos/")) throw new Error(`[FAULT_INJECTION cleanup-delete] Không xóa được ${key}`);
      return inner.delete(key);
    };
  }
  return proxy;
}
