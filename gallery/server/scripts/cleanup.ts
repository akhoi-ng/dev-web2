// Chạy tác vụ dọn file một lần: key trong storage_cleanups, journal trên đĩa, ảnh kẹt ở DELETING.
import { config } from "./_env.js";
import { disconnectPrisma, getPrisma } from "../src/db.js";
import { CleanupQueue } from "../src/photos/cleanup.js";
import { createStorageRegistry } from "../src/storage/index.js";

const prisma = getPrisma();
const storages = await createStorageRegistry(config);
const queue = new CleanupQueue(prisma, storages, config.cleanup.journalPath, config.cleanup.versionRetentionMs);

console.log("Trước khi dọn:", await queue.pendingCount());
const summary = await queue.run({ deletingOlderThanMs: 0 });
console.log("Kết quả:", summary);
console.log("Sau khi dọn:", await queue.pendingCount());
await disconnectPrisma();
process.exit(summary.keysFailed > 0 || summary.photosFailed > 0 ? 2 : 0);
