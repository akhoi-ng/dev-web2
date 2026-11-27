import type { TestStep } from "./types.js";

export function describeError(err: unknown): string {
  if (err instanceof Error) {
    const meta = (err as { $metadata?: { httpStatusCode?: number } }).$metadata;
    const status = meta?.httpStatusCode ? ` (HTTP ${meta.httpStatusCode})` : "";
    const code = (err as NodeJS.ErrnoException).code;
    return `${err.name !== "Error" ? `${err.name}: ` : ""}${err.message}${status}${code && !err.message.includes(code) ? ` [${code}]` : ""}`;
  }
  return String(err);
}

export async function timed(step: string, fn: () => Promise<string | void>, optional = false): Promise<TestStep> {
  const started = performance.now();
  try {
    const detail = await fn();
    return { step, ok: true, ms: Math.round(performance.now() - started), ...(detail ? { detail } : {}), ...(optional ? { optional } : {}) };
  } catch (err) {
    return { step, ok: false, ms: Math.round(performance.now() - started), detail: describeError(err), ...(optional ? { optional } : {}) };
  }
}
