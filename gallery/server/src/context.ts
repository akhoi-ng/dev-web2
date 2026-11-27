import type { PrismaClient } from "@prisma/client";
import type { Config } from "./config.js";
import { Sessions } from "./auth/session.js";
import { CleanupQueue } from "./photos/cleanup.js";
import { EditService } from "./photos/edit.js";
import { createUrlBuilder, type UrlBuilder } from "./photos/serialize.js";
import type { StorageRegistry } from "./storage/index.js";
import { UploadService } from "./upload/service.js";
import { Semaphore } from "./util/semaphore.js";

export interface AppContext {
  config: Config;
  prisma: PrismaClient;
  storages: StorageRegistry;
  urls: UrlBuilder;
  sessions: Sessions;
  cleanup: CleanupQueue;
  uploads: UploadService;
  edits: EditService;
}

export function createContext(config: Config, prisma: PrismaClient, storages: StorageRegistry): AppContext {
  const urls = createUrlBuilder(storages, config.mediaBaseUrl);
  const cleanup = new CleanupQueue(prisma, storages, config.cleanup.journalPath, config.cleanup.versionRetentionMs);
  // Upload và chỉnh sửa dùng chung giới hạn số ảnh xử lý đồng thời (PROCESSING_CONCURRENCY)
  const semaphore = new Semaphore(config.upload.concurrency);
  const base = { prisma, storages, cleanup, urls, upload: config.upload, faults: config.faults, semaphore };
  return {
    config,
    prisma,
    storages,
    urls,
    sessions: new Sessions(prisma, config),
    cleanup,
    uploads: new UploadService(base),
    edits: new EditService({ ...base, versionRetentionMs: config.cleanup.versionRetentionMs }),
  };
}
