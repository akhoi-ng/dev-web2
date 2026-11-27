import type { PrismaClient } from "@prisma/client";
import type { Config } from "./config.js";
import { Sessions } from "./auth/session.js";
import { CleanupQueue } from "./photos/cleanup.js";
import { createUrlBuilder, type UrlBuilder } from "./photos/serialize.js";
import type { StorageRegistry } from "./storage/index.js";
import { UploadService } from "./upload/service.js";

export interface AppContext {
  config: Config;
  prisma: PrismaClient;
  storages: StorageRegistry;
  urls: UrlBuilder;
  sessions: Sessions;
  cleanup: CleanupQueue;
  uploads: UploadService;
}

export function createContext(config: Config, prisma: PrismaClient, storages: StorageRegistry): AppContext {
  const urls = createUrlBuilder(storages, config.mediaBaseUrl);
  const cleanup = new CleanupQueue(prisma, storages, config.cleanup.journalPath);
  return {
    config,
    prisma,
    storages,
    urls,
    sessions: new Sessions(prisma, config),
    cleanup,
    uploads: new UploadService({ prisma, storages, cleanup, urls, upload: config.upload, faults: config.faults }),
  };
}
