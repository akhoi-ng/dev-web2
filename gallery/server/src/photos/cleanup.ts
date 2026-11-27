import fs from "node:fs/promises";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";
import { log } from "../log.js";
import type { StorageRegistry } from "../storage/index.js";
import { describeError } from "../storage/timed.js";

export interface CompensationResult {
  storage: string;
  deleted: string[];
  /** Xóa thất bại, đã lưu key vào bảng storage_cleanups */
  queued: string[];
  /** Xóa thất bại và DB cũng không ghi được: key nằm trong file journal trên đĩa */
  journaled: string[];
}

interface JournalEntry {
  storage?: string;
  key: string;
  reason: string;
  photoId: string | null;
  error?: string;
}

/**
 * Hàng đợi dọn file. Giao dịch DB không hoàn tác được file đã ghi vào kho, nên khi một bước sau
 * khi ghi file thất bại, ứng dụng xóa bù các file đó; xóa bù cũng lỗi thì lưu (tên kho, key) để chạy lại.
 */
export class CleanupQueue {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly storages: StorageRegistry,
    private readonly journalPath: string,
    /** Giữ file của version cũ thêm bao lâu sau khi bị thay thế (VERSION_RETENTION_HOURS) */
    private readonly versionRetentionMs = 24 * 60 * 60 * 1000,
  ) {}

  /** Xóa ngay các key trong kho `storage`; key nào xóa lỗi thì đưa vào hàng đợi (DB, hoặc journal nếu DB cũng lỗi). */
  async compensate(storage: string, keys: string[], reason: string, photoId?: string): Promise<CompensationResult> {
    const result: CompensationResult = { storage, deleted: [], queued: [], journaled: [] };
    const driver = this.storages.get(storage);
    const settled = await Promise.allSettled(keys.map((k) => driver.delete(k)));
    const failed: { key: string; error: string }[] = [];
    settled.forEach((s, i) => {
      const key = keys[i]!;
      if (s.status === "fulfilled") result.deleted.push(key);
      else failed.push({ key, error: describeError(s.reason) });
    });
    if (failed.length === 0) return result;

    try {
      await this.enqueue(storage, failed, reason, photoId);
      result.queued.push(...failed.map((f) => f.key));
    } catch (err) {
      log.error("Không ghi được hàng đợi dọn file vào DB, ghi vào journal trên đĩa", { error: describeError(err), journal: this.journalPath });
      await this.appendJournal(failed.map((f) => ({ storage, key: f.key, reason, photoId: photoId ?? null, error: f.error })));
      result.journaled.push(...failed.map((f) => f.key));
    }
    log.warn("Xóa bù thất bại, đã lưu key để dọn lại", { storage, reason, photoId, keys: failed.map((f) => f.key) });
    return result;
  }

  async enqueue(storage: string, items: { key: string; error?: string }[], reason: string, photoId?: string | null): Promise<void> {
    await this.prisma.$transaction(
      items.map((item) =>
        this.prisma.storageCleanup.upsert({
          where: { storage_storageKey: { storage, storageKey: item.key } },
          create: { storage, storageKey: item.key, reason, photoId: photoId ?? null, lastError: item.error ?? null },
          update: { reason, lastError: item.error ?? null },
        }),
      ),
    );
  }

  private async appendJournal(entries: JournalEntry[]) {
    await fs.mkdir(path.dirname(this.journalPath), { recursive: true });
    const lines = entries.map((e) => JSON.stringify({ ...e, at: new Date().toISOString() })).join("\n") + "\n";
    await fs.appendFile(this.journalPath, lines, "utf8");
  }

  /** Đọc journal trên đĩa vào bảng storage_cleanups rồi xóa journal. */
  private async drainJournal(): Promise<number> {
    let text: string;
    try {
      text = await fs.readFile(this.journalPath, "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return 0;
      throw err;
    }
    const entries = text
      .split("\n")
      .filter(Boolean)
      .flatMap((line) => {
        try {
          return [JSON.parse(line) as JournalEntry];
        } catch {
          return [];
        }
      });
    for (const e of entries) {
      await this.enqueue(e.storage ?? this.storages.defaultName, [{ key: e.key, ...(e.error ? { error: e.error } : {}) }], e.reason, e.photoId);
    }
    await fs.rm(this.journalPath, { force: true });
    return entries.length;
  }

  /**
   * Chạy dọn:
   *  1. Đưa journal trên đĩa vào DB.
   *  2. Xóa các key trong storage_cleanups ở đúng kho (bỏ qua key vẫn thuộc một ảnh đang tồn tại).
   *  3. Hoàn tất các ảnh DELETING đã quá hạn: xóa file còn lại rồi xóa bản ghi.
   *  4. Dọn version cũ đã bị thay thế quá VERSION_RETENTION_HOURS: xóa file variant của version đó,
   *     rồi xóa PhotoVariant và đánh dấu PhotoVersion.filesCleanedAt (giữ bản ghi làm lịch sử).
   *     Xóa file lỗi thì giữ nguyên để lần chạy sau thử lại.
   */
  async run(opts: { deletingOlderThanMs?: number } = {}) {
    const summary = {
      journalImported: 0,
      keysDeleted: 0,
      keysFailed: 0,
      keysSkipped: 0,
      photosFinalized: 0,
      photosFailed: 0,
      oldVersionsCleaned: 0,
      oldVersionsFailed: 0,
    };
    summary.journalImported = await this.drainJournal();

    const pending = await this.prisma.storageCleanup.findMany({ orderBy: { createdAt: "asc" }, take: 500 });
    for (const item of pending) {
      // An toàn: không xóa file mà một ảnh còn sống (cùng kho) đang dùng
      const inUse =
        (await this.prisma.photoVariant.count({ where: { storageKey: item.storageKey, photo: { storage: item.storage, status: { not: "DELETING" } } } })) +
        (await this.prisma.photo.count({ where: { storage: item.storage, originalKey: item.storageKey, status: { not: "DELETING" } } }));
      if (inUse > 0) {
        await this.prisma.storageCleanup.delete({ where: { id: item.id } });
        summary.keysSkipped++;
        continue;
      }
      const driver = this.storages.tryGet(item.storage);
      try {
        if (!driver) throw new Error(`Kho "${item.storage}" không còn trong STORAGE_PROFILES`);
        await driver.delete(item.storageKey);
        await this.prisma.storageCleanup.delete({ where: { id: item.id } });
        summary.keysDeleted++;
      } catch (err) {
        await this.prisma.storageCleanup.update({ where: { id: item.id }, data: { attempts: { increment: 1 }, lastError: describeError(err) } });
        summary.keysFailed++;
      }
    }

    const cutoff = new Date(Date.now() - (opts.deletingOlderThanMs ?? 60_000));
    const stuck = await this.prisma.photo.findMany({
      where: { status: "DELETING", deleteRequestedAt: { lt: cutoff } },
      include: { variants: true },
      take: 100,
    });
    for (const photo of stuck) {
      const outcome = await deletePhotoFiles(this.storages, photo);
      if (outcome.failed.length === 0) {
        await this.prisma.photo.deleteMany({ where: { id: photo.id } });
        summary.photosFinalized++;
      } else {
        summary.photosFailed++;
      }
    }
    const versionCutoff = new Date(Date.now() - this.versionRetentionMs);
    const oldVersions = await this.prisma.photoVersion.findMany({
      where: { supersededAt: { not: null, lte: versionCutoff }, filesCleanedAt: null, photo: { status: { not: "DELETING" } } },
      include: { photo: { select: { storage: true, currentVersion: true } } },
      orderBy: { supersededAt: "asc" },
      take: 200,
    });
    for (const old of oldVersions) {
      // An toàn: không bao giờ dọn version đang công bố
      if (old.version === old.photo.currentVersion) continue;
      const variants = await this.prisma.photoVariant.findMany({ where: { photoId: old.photoId, version: old.version }, select: { id: true, storageKey: true } });
      const driver = this.storages.tryGet(old.photo.storage);
      if (!driver) {
        summary.oldVersionsFailed++;
        continue;
      }
      const settled = await Promise.allSettled(variants.map((v) => driver.delete(v.storageKey)));
      if (settled.some((r) => r.status === "rejected")) {
        summary.oldVersionsFailed++;
        continue;
      }
      await this.prisma.$transaction([
        this.prisma.photoVariant.deleteMany({ where: { id: { in: variants.map((v) => v.id) } } }),
        this.prisma.photoVersion.update({ where: { id: old.id }, data: { filesCleanedAt: new Date() } }),
      ]);
      summary.oldVersionsCleaned++;
    }

    if (Object.values(summary).some((n) => n > 0)) {
      log.info("Đã chạy dọn file", summary);
    }
    return summary;
  }

  async pendingCount(): Promise<{ keys: number; deletingPhotos: number; oldVersions: number; versionRetentionHours: number }> {
    const [keys, deletingPhotos, oldVersions] = await Promise.all([
      this.prisma.storageCleanup.count(),
      this.prisma.photo.count({ where: { status: "DELETING" } }),
      // Version cũ còn file trong kho (đang trong thời hạn giữ hoặc chờ lần dọn kế tiếp)
      this.prisma.photoVersion.count({ where: { supersededAt: { not: null }, filesCleanedAt: null } }),
    ]);
    return { keys, deletingPhotos, oldVersions, versionRetentionHours: this.versionRetentionMs / 3_600_000 };
  }
}

/** Xóa mọi file của một ảnh (mọi version của variant + bản gốc) trong kho của chính ảnh đó. */
export async function deletePhotoFiles(
  storages: StorageRegistry,
  photo: { storage: string; originalKey: string; variants: { storageKey: string }[] },
): Promise<{ deleted: string[]; failed: { key: string; error: string }[] }> {
  const keys = [...photo.variants.map((v) => v.storageKey), photo.originalKey];
  const driver = storages.tryGet(photo.storage);
  if (!driver) {
    const error = `Kho "${photo.storage}" không còn trong STORAGE_PROFILES`;
    return { deleted: [], failed: keys.map((key) => ({ key, error })) };
  }
  const settled = await Promise.allSettled(keys.map((k) => driver.delete(k)));
  const deleted: string[] = [];
  const failed: { key: string; error: string }[] = [];
  settled.forEach((s, i) => (s.status === "fulfilled" ? deleted.push(keys[i]!) : failed.push({ key: keys[i]!, error: describeError(s.reason) })));
  return { deleted, failed };
}
