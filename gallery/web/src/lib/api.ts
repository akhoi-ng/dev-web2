export type PhotoStatus = "PUBLISHED" | "HIDDEN" | "DELETING";

export interface Variant {
  width: number;
  height: number;
  bytes: number;
  mime: string;
  url: string;
  storageKey?: string;
}

export interface Photo {
  id: string;
  title: string;
  altText: string;
  description: string | null;
  tags: string[];
  status: PhotoStatus;
  storage: { name: string; label: string };
  album: { id: string; title: string; slug: string } | null;
  width: number;
  height: number;
  blurDataUrl: string | null;
  src: string;
  srcSet: string;
  variants: Variant[];
  original: { width: number; height: number; bytes: number; mime: string; downloadUrl: string; storageKey?: string };
  source: { filename: string; format: string; bytes: number };
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface Album {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  photoCount: number;
  cover: { src: string; blurDataUrl: string | null; altText: string } | null;
  createdAt: string;
}

export interface TagCount {
  tag: string;
  count: number;
}

export interface User {
  id: string;
  email: string;
  name: string | null;
}

export interface UploadLimits {
  maxFiles: number;
  maxFileBytes: number;
  maxRequestBytes: number;
  maxPixels: number;
  formats: string[];
  variants: { width: number; quality: number }[];
  defaultStorage: string;
  storages: StorageChoice[];
}

export interface StorageChoice {
  name: string;
  label: string;
  isDefault: boolean;
}

export interface FileError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export type FileResult =
  | { index: number; filename: string; ok: true; photo: Photo }
  | { index: number; filename: string; ok: false; error: FileError; cleanup?: { deleted: string[]; queued: string[]; journaled: string[] } };

export interface UploadResponse {
  status: number;
  summary: { received: number; accepted: number; rejected: number };
  limits: Omit<UploadLimits, "variants">;
  results: FileResult[];
}

export interface StorageTestResult {
  ok: boolean;
  storage: string;
  steps: TestStep[];
}

export interface TestStep {
  step: string;
  ok: boolean;
  ms: number;
  detail?: string;
  optional?: boolean;
}

export interface StorageInfo extends StorageChoice {
  downloadMode: "proxy" | "presigned";
  publicBaseUrl: string | null;
  details: Record<string, string | boolean | null>;
  photoCount: number;
  sourceBytes: number;
}

export interface Overview {
  defaultStorage: string;
  storages: StorageInfo[];
  orphanStorages: { name: string; photoCount: number }[];
  mediaBaseUrl: string;
  faults: string[];
  limits: UploadLimits;
  photos: Partial<Record<PhotoStatus, number>>;
  bytes: { source: number; original: number; variants: { width: number; count: number; bytes: number }[] };
  cleanup: { keys: number; deletingPhotos: number };
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

const UNSAFE = new Set(["POST", "PATCH", "PUT", "DELETE"]);

/** fetch cùng origin, gửi cookie phiên và header chống CSRF cho request ghi. */
export async function api<T>(path: string, init: { method?: string; json?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const method = init.method ?? "GET";
  const headers: Record<string, string> = { Accept: "application/json" };
  if (UNSAFE.has(method)) headers["X-Requested-With"] = "XMLHttpRequest";
  if (init.json !== undefined) headers["Content-Type"] = "application/json";
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers,
      credentials: "same-origin",
      ...(init.json !== undefined ? { body: JSON.stringify(init.json) } : {}),
      ...(init.signal ? { signal: init.signal } : {}),
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    throw new ApiError(0, "NETWORK_ERROR", "Không kết nối được tới máy chủ");
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }
  if (!res.ok && res.status !== 207) {
    const err = (body as { error?: { code?: string; message?: string; details?: unknown } } | null)?.error;
    throw new ApiError(res.status, err?.code ?? `HTTP_${res.status}`, err?.message ?? `Lỗi ${res.status}`, err?.details);
  }
  return body as T;
}

export function qs(params: Record<string, string | number | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : "";
}
