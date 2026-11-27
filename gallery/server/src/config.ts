import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

/** Thư mục gốc của package server (chứa package.json), dù chạy từ src/ (tsx) hay dist/src/ (node). */
export const SERVER_ROOT = (() => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return here.includes(`${path.sep}dist${path.sep}`) || here.endsWith(`${path.sep}dist`)
    ? path.resolve(here, "..", "..")
    : path.resolve(here, "..");
})();

/** Đọc file .env của server nếu có (Node >= 20.12). Biến đã đặt trong môi trường được giữ nguyên. */
export function loadEnvFile(file = path.join(SERVER_ROOT, ".env")): void {
  try {
    process.loadEnvFile(file);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}

const MiB = 1024 * 1024;

const bool = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? def : ["1", "true", "yes", "on"].includes(v.toLowerCase())));

const int = (def: number, min = 0) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? def : Number(v)))
    .pipe(z.number().int().min(min));

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v === undefined || v.trim() === "" ? undefined : v.trim()));

/** "320:75,960:82,1600:86" -> [{ width: 320, quality: 75 }, ...] */
const variantSpec = z
  .string()
  .optional()
  .transform((v, ctx) => {
    const raw = v && v.trim() !== "" ? v : "320:75,960:82,1600:86";
    const specs = raw.split(",").map((part) => {
      const [w, q] = part.trim().split(":");
      return { width: Number(w), quality: q === undefined ? 80 : Number(q) };
    });
    const valid = specs.every(
      (s) => Number.isInteger(s.width) && s.width >= 16 && s.width <= 8192 && Number.isInteger(s.quality) && s.quality >= 1 && s.quality <= 100,
    );
    if (!valid || specs.length === 0 || specs.length > 3) {
      ctx.addIssue({ code: "custom", message: "VARIANTS phải có 1-3 mục dạng <chiều rộng>:<quality>, ví dụ 320:75,960:82,1600:86" });
      return z.NEVER;
    }
    return specs.sort((a, b) => a.width - b.width);
  });

const FAULTS = ["db-commit", "storage-write", "cleanup-delete"] as const;
export type Fault = (typeof FAULTS)[number];

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    PORT: int(4000, 1),
    TRUST_PROXY: int(0),
    JWT_SECRET: z.string().min(32, "JWT_SECRET cần ít nhất 32 ký tự ngẫu nhiên"),
    SESSION_TTL_HOURS: int(12, 1),
    COOKIE_SECURE: z.string().optional(),
    ADMIN_EMAIL: optionalString,
    ADMIN_PASSWORD: optionalString,
    WEB_DIST_DIR: optionalString,

    // Nhiều kho: STORAGE_PROFILES=r2,seaweedfs + biến <TÊN>_DRIVER, <TÊN>_ENDPOINT... (xem readStorageProfiles)
    STORAGE_PROFILES: optionalString,
    STORAGE_DEFAULT: optionalString,
    MEDIA_BASE_URL: optionalString,

    UPLOAD_MAX_FILES: int(5, 1),
    UPLOAD_MAX_FILE_BYTES: int(10 * MiB, 1),
    UPLOAD_MAX_REQUEST_BYTES: int(55 * MiB, 1),
    UPLOAD_MAX_PIXELS: int(40_000_000, 1),
    VARIANTS: variantSpec,
    PROCESSING_CONCURRENCY: int(2, 1),

    CLEANUP_INTERVAL_MS: int(10 * 60 * 1000),
    CLEANUP_JOURNAL_PATH: optionalString,
    FAULT_INJECTION: optionalString,
  })
  .superRefine((env, ctx) => {
    if (env.UPLOAD_MAX_REQUEST_BYTES < env.UPLOAD_MAX_FILE_BYTES) {
      ctx.addIssue({ code: "custom", path: ["UPLOAD_MAX_REQUEST_BYTES"], message: "Phải lớn hơn UPLOAD_MAX_FILE_BYTES" });
    }
  });

export type S3Provider = "seaweedfs" | "minio" | "r2" | "aws" | "other";
const S3_PROVIDERS: readonly S3Provider[] = ["seaweedfs", "minio", "r2", "aws", "other"];

export interface S3Settings {
  provider: S3Provider;
  endpoint: string | undefined;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
  publicBaseUrl: string | undefined;
}

/**
 * Một kho lưu ảnh có tên. Nhiều kho được khai báo lúc khởi động (STORAGE_PROFILES); admin chọn kho
 * khi upload, mỗi Photo ghi tên kho của nó. Không có cơ chế tự chuyển kho khi lỗi.
 */
export type StorageProfile = { name: string; label: string; downloadMode: "proxy" | "presigned" } & (
  | { driver: "local"; root: string }
  | { driver: "s3"; s3: S3Settings }
);

export interface Config {
  env: "development" | "production" | "test";
  port: number;
  trustProxy: number;
  jwtSecret: string;
  sessionTtlHours: number;
  cookieSecure: boolean;
  admin: { email: string; password: string } | null;
  webDistDir: string;
  storages: StorageProfile[];
  /** Tên kho mặc định khi upload không chỉ định kho */
  defaultStorage: string;
  /** Tiền tố URL công khai của media khi web server là origin, ví dụ "/media" hoặc "https://cdn.example.com/media" */
  mediaBaseUrl: string;
  upload: {
    maxFiles: number;
    maxFileBytes: number;
    maxRequestBytes: number;
    maxPixels: number;
    variants: { width: number; quality: number }[];
    concurrency: number;
  };
  cleanup: { intervalMs: number; journalPath: string };
  faults: Set<Fault>;
}

export class ConfigError extends Error {}

export function readConfig(source: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join(".") || "(env)"}: ${i.message}`);
    throw new ConfigError(`Cấu hình .env không hợp lệ:\n${lines.join("\n")}`);
  }
  const e = parsed.data;

  const faults = new Set<Fault>();
  if (e.FAULT_INJECTION) {
    for (const f of e.FAULT_INJECTION.split(",").map((s) => s.trim()).filter(Boolean)) {
      if (!(FAULTS as readonly string[]).includes(f)) throw new ConfigError(`FAULT_INJECTION không hỗ trợ "${f}" (chỉ: ${FAULTS.join(", ")})`);
      faults.add(f as Fault);
    }
    // Không bao giờ giả lập lỗi trên production
    if (e.NODE_ENV === "production") faults.clear();
  }

  const { storages, defaultStorage } = readStorageProfiles(source, e);

  const cookieSecure = bool(e.NODE_ENV === "production").parse(e.COOKIE_SECURE);

  return {
    env: e.NODE_ENV,
    port: e.PORT,
    trustProxy: e.TRUST_PROXY,
    jwtSecret: e.JWT_SECRET,
    sessionTtlHours: e.SESSION_TTL_HOURS,
    cookieSecure,
    admin: e.ADMIN_EMAIL && e.ADMIN_PASSWORD ? { email: e.ADMIN_EMAIL.toLowerCase(), password: e.ADMIN_PASSWORD } : null,
    webDistDir: e.WEB_DIST_DIR ? path.resolve(SERVER_ROOT, e.WEB_DIST_DIR) : path.resolve(SERVER_ROOT, "..", "web", "dist"),
    storages,
    defaultStorage,
    mediaBaseUrl: (e.MEDIA_BASE_URL ?? "/media").replace(/\/+$/, ""),
    upload: {
      maxFiles: e.UPLOAD_MAX_FILES,
      maxFileBytes: e.UPLOAD_MAX_FILE_BYTES,
      maxRequestBytes: e.UPLOAD_MAX_REQUEST_BYTES,
      maxPixels: e.UPLOAD_MAX_PIXELS,
      variants: e.VARIANTS,
      concurrency: e.PROCESSING_CONCURRENCY,
    },
    cleanup: {
      intervalMs: e.CLEANUP_INTERVAL_MS,
      journalPath: e.CLEANUP_JOURNAL_PATH ? path.resolve(e.CLEANUP_JOURNAL_PATH) : path.join(SERVER_ROOT, "data", "cleanup-journal.ndjson"),
    },
    faults,
  };
}

const PROVIDER_LABEL: Record<S3Provider, string> = {
  r2: "Cloudflare R2",
  aws: "AWS S3",
  seaweedfs: "SeaweedFS",
  minio: "MinIO",
  other: "S3",
};
const TRUE_VALUES = ["1", "true", "yes", "on"];

/**
 * Đọc các kho lưu ảnh.
 *
 * Nhiều kho (khuyến nghị):
 *   STORAGE_PROFILES=r2,seaweedfs      tên kho, chữ thường
 *   STORAGE_DEFAULT=r2                 kho mặc định khi upload
 *   R2_DRIVER=s3  R2_PROVIDER=r2  R2_ENDPOINT=...  R2_BUCKET=...  R2_ACCESS_KEY_ID=...
 *   R2_SECRET_ACCESS_KEY=...  R2_PUBLIC_BASE_URL=...  R2_DOWNLOAD_MODE=presigned  R2_LABEL=...
 *   SEAWEEDFS_DRIVER=s3  SEAWEEDFS_FORCE_PATH_STYLE=true ...
 *   <TÊN>_DRIVER=local  <TÊN>_ROOT=/srv/gallery-uploads
 *
 * Một kho (kiểu cũ, vẫn hỗ trợ): STORAGE_DRIVER, LOCAL_STORAGE_ROOT, S3_*, DOWNLOAD_MODE -> kho "default".
 */
function readStorageProfiles(env: NodeJS.ProcessEnv, e: { STORAGE_PROFILES?: string | undefined; STORAGE_DEFAULT?: string | undefined }) {
  const issues: string[] = [];
  const val = (k: string) => {
    const v = env[k];
    return v === undefined || v.trim() === "" ? undefined : v.trim();
  };
  const profiles: StorageProfile[] = [];

  if (e.STORAGE_PROFILES) {
    for (const name of e.STORAGE_PROFILES.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)) {
      if (!/^[a-z][a-z0-9_-]{0,30}$/.test(name)) {
        issues.push(`STORAGE_PROFILES: tên kho "${name}" không hợp lệ (bắt đầu bằng chữ cái; chỉ chữ thường, số, - và _)`);
        continue;
      }
      if (profiles.some((p) => p.name === name)) {
        issues.push(`STORAGE_PROFILES: tên kho "${name}" bị lặp`);
        continue;
      }
      const prefix = `${name.toUpperCase().replace(/-/g, "_")}_`;
      const profile = buildProfile(name, (k) => val(prefix + k), (k) => prefix + k, issues);
      if (profile) profiles.push(profile);
    }
    if (profiles.length === 0 && issues.length === 0) issues.push("STORAGE_PROFILES: cần ít nhất một kho");
  } else {
    const legacy: Record<string, string> = {
      DRIVER: "STORAGE_DRIVER",
      ROOT: "LOCAL_STORAGE_ROOT",
      LABEL: "STORAGE_LABEL",
      DOWNLOAD_MODE: "DOWNLOAD_MODE",
      PROVIDER: "S3_PROVIDER",
      ENDPOINT: "S3_ENDPOINT",
      REGION: "S3_REGION",
      BUCKET: "S3_BUCKET",
      ACCESS_KEY_ID: "S3_ACCESS_KEY_ID",
      SECRET_ACCESS_KEY: "S3_SECRET_ACCESS_KEY",
      FORCE_PATH_STYLE: "S3_FORCE_PATH_STYLE",
      PUBLIC_BASE_URL: "S3_PUBLIC_BASE_URL",
    };
    const profile = buildProfile("default", (k) => val(legacy[k]!), (k) => legacy[k]!, issues);
    if (profile) profiles.push(profile);
  }

  const defaultStorage = (e.STORAGE_DEFAULT ?? profiles[0]?.name ?? "default").toLowerCase();
  if (profiles.length > 0 && !profiles.some((p) => p.name === defaultStorage)) {
    issues.push(`STORAGE_DEFAULT: "${defaultStorage}" không có trong STORAGE_PROFILES (${profiles.map((p) => p.name).join(", ")})`);
  }
  if (issues.length) throw new ConfigError(`Cấu hình kho lưu trữ không hợp lệ:\n${issues.map((i) => `  - ${i}`).join("\n")}`);
  return { storages: profiles, defaultStorage };
}

function buildProfile(
  name: string,
  get: (key: string) => string | undefined,
  keyName: (key: string) => string,
  issues: string[],
): StorageProfile | null {
  const driver = (get("DRIVER") ?? "local").toLowerCase();
  const downloadMode = (get("DOWNLOAD_MODE") ?? "proxy").toLowerCase();
  if (driver !== "local" && driver !== "s3") {
    issues.push(`${keyName("DRIVER")}: chỉ nhận local hoặc s3`);
    return null;
  }
  if (downloadMode !== "proxy" && downloadMode !== "presigned") {
    issues.push(`${keyName("DOWNLOAD_MODE")}: chỉ nhận proxy hoặc presigned`);
    return null;
  }

  if (driver === "local") {
    const root = get("ROOT");
    if (!root) issues.push(`${keyName("ROOT")}: cần đường dẫn tuyệt đối tới thư mục lưu ảnh (ngoài source code)`);
    else if (!path.isAbsolute(root)) issues.push(`${keyName("ROOT")}: phải là đường dẫn tuyệt đối`);
    if (downloadMode === "presigned") issues.push(`${keyName("DOWNLOAD_MODE")}: presigned chỉ dùng với driver s3`);
    if (!root || !path.isAbsolute(root) || downloadMode === "presigned") return null;
    return { name, label: get("LABEL") ?? "Ổ đĩa server", downloadMode: "proxy", driver: "local", root: path.resolve(root) };
  }

  const provider = (get("PROVIDER") ?? "seaweedfs").toLowerCase() as S3Provider;
  if (!S3_PROVIDERS.includes(provider)) {
    issues.push(`${keyName("PROVIDER")}: chỉ nhận ${S3_PROVIDERS.join(", ")}`);
    return null;
  }
  let ok = true;
  for (const k of ["BUCKET", "ACCESS_KEY_ID", "SECRET_ACCESS_KEY"]) {
    if (!get(k)) {
      issues.push(`${keyName(k)}: bắt buộc với driver s3`);
      ok = false;
    }
  }
  if (provider !== "aws" && !get("ENDPOINT")) {
    issues.push(`${keyName("ENDPOINT")}: bắt buộc với SeaweedFS/MinIO/R2 (ví dụ http://10.0.0.5:8333)`);
    ok = false;
  }
  if (!ok) return null;
  const forcePathStyle = get("FORCE_PATH_STYLE");
  return {
    name,
    label: get("LABEL") ?? PROVIDER_LABEL[provider],
    downloadMode,
    driver: "s3",
    s3: {
      provider,
      endpoint: get("ENDPOINT"),
      region: get("REGION") ?? (provider === "r2" ? "auto" : "us-east-1"),
      bucket: get("BUCKET")!,
      accessKeyId: get("ACCESS_KEY_ID")!,
      secretAccessKey: get("SECRET_ACCESS_KEY")!,
      // SeaweedFS/MinIO dùng path-style (https://host/<bucket>/<key>), AWS/R2 mặc định virtual-hosted
      forcePathStyle: forcePathStyle ? TRUE_VALUES.includes(forcePathStyle.toLowerCase()) : provider === "seaweedfs" || provider === "minio" || provider === "other",
      publicBaseUrl: get("PUBLIC_BASE_URL")?.replace(/\/+$/, ""),
    },
  };
}
