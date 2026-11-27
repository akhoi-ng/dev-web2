type Level = "debug" | "info" | "warn" | "error";

const order: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = order[(process.env.LOG_LEVEL as Level) ?? "info"] ?? order.info;

function write(level: Level, msg: string, data?: Record<string, unknown>) {
  if (order[level] < threshold || process.env.LOG_SILENT === "1") return;
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...data }, (_k, v) =>
    v instanceof Error ? { name: v.name, message: v.message } : v,
  );
  (level === "error" || level === "warn" ? process.stderr : process.stdout).write(line + "\n");
}

export const log = {
  debug: (msg: string, data?: Record<string, unknown>) => write("debug", msg, data),
  info: (msg: string, data?: Record<string, unknown>) => write("info", msg, data),
  warn: (msg: string, data?: Record<string, unknown>) => write("warn", msg, data),
  error: (msg: string, data?: Record<string, unknown>) => write("error", msg, data),
};
