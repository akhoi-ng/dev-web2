// Bằng chứng: Photo, PhotoVariant, danh sách storage key và đối chiếu với file thực có trong TỪNG kho.
//   npm run db:report            in bảng
//   npm run db:report -- --json  in JSON
import { config } from "./_env.js";
import { disconnectPrisma, getPrisma } from "../src/db.js";
import { createStorageRegistry } from "../src/storage/index.js";

const asJson = process.argv.includes("--json");
const prisma = getPrisma();
const registry = await createStorageRegistry(config);

const photos = await prisma.photo.findMany({
  orderBy: { createdAt: "asc" },
  include: { variants: { orderBy: [{ version: "asc" }, { width: "asc" }] } },
});
const cleanups = await prisma.storageCleanup.findMany({ orderBy: { createdAt: "asc" } });

// File thật trong mỗi kho đang cấu hình
const objects = new Map<string, Map<string, number>>();
for (const name of registry.names) {
  const m = new Map<string, number>();
  for await (const obj of registry.get(name).list("photos/")) m.set(obj.key, obj.bytes);
  objects.set(name, m);
}
const has = (storage: string, key: string) => objects.get(storage)?.has(key) ?? false;

const dbKeys = new Map<string, Set<string>>();
for (const p of photos) {
  const set = dbKeys.get(p.storage) ?? new Set<string>();
  set.add(p.originalKey);
  for (const v of p.variants) set.add(v.storageKey);
  dbKeys.set(p.storage, set);
}
const missingInStorage = [...dbKeys].flatMap(([s, keys]) => [...keys].filter((k) => !has(s, k)).map((k) => `${s}:${k}`));
const orphanFiles = [...objects].flatMap(([s, m]) => [...m.keys()].filter((k) => !dbKeys.get(s)?.has(k)).map((k) => `${s}:${k}`));

if (asJson) {
  console.log(
    JSON.stringify(
      {
        storages: registry.info(),
        photos,
        cleanups,
        objects: Object.fromEntries([...objects].map(([s, m]) => [s, Object.fromEntries(m)])),
        missingInStorage,
        orphanFiles,
      },
      null,
      2,
    ),
  );
} else {
  for (const s of registry.info()) console.log(`Kho ${s.name}${s.isDefault ? " (mặc định)" : ""}: ${JSON.stringify(s.details)}`);
  console.log(`\nPhoto (${photos.length})`);
  console.table(
    photos.map((p) => ({
      id: p.id,
      title: p.title,
      alt_text: p.altText.slice(0, 30),
      status: p.status,
      storage: p.storage,
      size: `${p.width}x${p.height}`,
      source: `${p.sourceFormat} ${p.sourceBytes}B`,
      original_key: p.originalKey,
      version: p.currentVersion,
    })),
  );
  console.log(`\nPhotoVariant (${photos.reduce((n, p) => n + p.variants.length, 0)})`);
  console.table(
    photos.flatMap((p) =>
      p.variants.map((v) => ({
        photo_id: v.photoId.slice(0, 8),
        storage: p.storage,
        version: v.version,
        size: `${v.width}x${v.height}`,
        mime: v.mime,
        bytes: v.bytes,
        storage_key: v.storageKey,
        in_storage: has(p.storage, v.storageKey) ? "yes" : "MISSING",
      })),
    ),
  );
  console.log(`\nstorage_cleanups (${cleanups.length})`);
  if (cleanups.length) {
    console.table(cleanups.map((c) => ({ storage: c.storage, storage_key: c.storageKey, reason: c.reason, attempts: c.attempts, last_error: c.lastError?.slice(0, 60) })));
  }
  for (const [s, m] of objects) console.log(`\nFile dưới photos/ trong kho ${s}: ${m.size}`);
  console.log(`Key trong DB nhưng thiếu file: ${missingInStorage.length ? missingInStorage.join(", ") : "không có"}`);
  console.log(`File trong kho không thuộc bản ghi nào: ${orphanFiles.length ? orphanFiles.join(", ") : "không có"}`);
}
await disconnectPrisma();
