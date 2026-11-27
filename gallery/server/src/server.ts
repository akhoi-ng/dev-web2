import { ConfigError, loadEnvFile, readConfig } from "./config.js";

loadEnvFile();

const { createApp } = await import("./app.js");
const { createContext } = await import("./context.js");
const { getPrisma, disconnectPrisma } = await import("./db.js");
const { createStorageRegistry } = await import("./storage/index.js");
const { ensureAdmin } = await import("./auth/bootstrap.js");
const { log } = await import("./log.js");

let config;
try {
  config = readConfig();
} catch (err) {
  if (err instanceof ConfigError) {
    console.error(err.message);
    process.exit(1);
  }
  throw err;
}

const prisma = getPrisma();
await prisma.$connect();
const storages = await createStorageRegistry(config);
await ensureAdmin(prisma, config);

// Ảnh trỏ tới kho không còn trong cấu hình sẽ không hiển thị được: cảnh báo ngay lúc khởi động
const usedStorages = await prisma.photo.groupBy({ by: ["storage"], _count: { _all: true } });
for (const g of usedStorages) {
  if (!storages.has(g.storage)) {
    log.warn("Có ảnh nằm ở kho không còn trong STORAGE_PROFILES", { storage: g.storage, photos: g._count._all, configured: storages.names });
  }
}

const ctx = createContext(config, prisma, storages);
const app = createApp(ctx);

const server = app.listen(config.port, () => {
  log.info("Photo Gallery server đang chạy", {
    url: `http://localhost:${config.port}`,
    storages: storages.info().map((s) => ({ name: s.name, label: s.label, default: s.isDefault, ...s.details })),
    mediaBaseUrl: config.mediaBaseUrl,
    limits: ctx.uploads.limits,
    variants: config.upload.variants,
    ...(config.faults.size ? { faults: [...config.faults] } : {}),
  });
});
// Upload 55 MiB trên mạng chậm: cho request tối đa 10 phút
server.requestTimeout = 10 * 60 * 1000;

// Dọn file định kỳ: key còn trong storage_cleanups và ảnh kẹt ở trạng thái DELETING
let timer: NodeJS.Timeout | undefined;
if (config.cleanup.intervalMs > 0) {
  const tick = () => ctx.cleanup.run().catch((err: unknown) => log.error("Tác vụ dọn file lỗi", { error: err }));
  setTimeout(tick, 5_000).unref();
  timer = setInterval(tick, config.cleanup.intervalMs);
  timer.unref();
}

const shutdown = (signal: string) => {
  log.info("Đang tắt server", { signal });
  clearInterval(timer);
  server.close(() => {
    disconnectPrisma().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
