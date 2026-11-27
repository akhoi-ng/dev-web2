/**
 * PostgreSQL cục bộ cho máy dev, dữ liệu nằm CỐ ĐỊNH ngoài thư mục Temp:
 *   npm run db:local              khởi động (lần đầu tự khởi tạo cluster và database), chạy tới khi Ctrl+C
 *   npm run db:local -- --stop    tắt cluster đang chạy
 *
 * Mặc định: D:\gallery-data\postgres (Windows) hoặc ~/gallery-data/postgres, cổng 55432,
 * user/password gallery/gallery, database gallery. Đổi bằng DB_LOCAL_DIR / DB_LOCAL_PORT.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";

const dataDir = path.resolve(
  process.env.DB_LOCAL_DIR ?? (process.platform === "win32" ? "D:\\gallery-data\\postgres" : path.join(os.homedir(), "gallery-data", "postgres")),
);
const port = Number(process.env.DB_LOCAL_PORT ?? 55432);
const user = process.env.DB_LOCAL_USER ?? "gallery";
const password = process.env.DB_LOCAL_PASSWORD ?? "gallery";
const database = "gallery";

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  port,
  user,
  password,
  persistent: true,
  // Không phụ thuộc locale của máy: database tạo với encoding UTF8
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
});

const fresh = !(await fs
  .access(path.join(dataDir, "PG_VERSION"))
  .then(() => true)
  .catch(() => false));

if (process.argv.includes("--stop")) {
  if (fresh) {
    console.log("Chưa có cluster ở", dataDir);
    process.exit(0);
  }
  await pg.stop();
  console.log("Đã tắt PostgreSQL ở", dataDir);
  process.exit(0);
}

if (fresh) {
  console.log("Khởi tạo cluster mới tại", dataDir);
  await pg.initialise();
}
await pg.start();

if (fresh) {
  await pg.createDatabase(database);
  console.log(`Đã tạo database "${database}"`);
}

const url = `postgresql://${user}:${password}@localhost:${port}/${database}?schema=gallery`;
console.log(
  [
    "",
    "PostgreSQL đang chạy.",
    `  Dữ liệu: ${dataDir}`,
    `  DATABASE_URL=${url}`,
    `  DIRECT_URL=${url}`,
    "",
    "Lần đầu: npm run db:migrate:prod && npm run db:seed:prod",
    "Tắt:    npm run db:local -- --stop   (hoặc Ctrl+C)",
    "",
  ].join("\n"),
);

const shutdown = async (signal: string) => {
  console.log(`\nNhận ${signal}, đang tắt PostgreSQL…`);
  await pg.stop().catch(() => {});
  process.exit(0);
};
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGHUP", () => void shutdown("SIGHUP"));
// Giữ tiến trình chạy
setInterval(() => {}, 1 << 30);
