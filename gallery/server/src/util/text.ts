/** Bỏ dấu tiếng Việt và ký tự lạ: "Bờ biển Đà Nẵng!" -> "bo-bien-da-nang" */
export function slugify(input: string, maxLength = 60): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/g, "");
}

/**
 * Làm sạch tên file người dùng gửi để HIỂN THỊ (không bao giờ dùng để ghép đường dẫn lưu):
 * bỏ thư mục, ký tự điều khiển, ký tự đặc biệt của hệ điều hành; giới hạn độ dài.
 */
export function sanitizeFilename(name: string | undefined): string {
  const base = (name ?? "").split(/[\\/]/).pop() ?? "";
  const cleaned = base
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return cleaned === "" || cleaned === "." || cleaned === ".." ? "unnamed" : cleaned;
}

/** "bo-bien.jpg" -> "Bo bien"; dùng làm tiêu đề mặc định khi người dùng bỏ trống. */
export function titleFromFilename(filename: string): string {
  const stem = filename.replace(/\.[^.]+$/, "").replace(/[_\-.]+/g, " ").replace(/\s+/g, " ").trim();
  if (!stem) return "Ảnh không tên";
  return stem.charAt(0).toUpperCase() + stem.slice(1, 120);
}

/** Chuẩn hóa danh sách tag: chữ thường, bỏ trùng, tối đa 10 tag, mỗi tag tối đa 30 ký tự. */
export function normalizeTags(input: string | string[] | undefined): string[] {
  const parts = Array.isArray(input) ? input : (input ?? "").split(",");
  const out: string[] = [];
  for (const p of parts) {
    const tag = p.normalize("NFC").trim().toLowerCase().replace(/\s+/g, " ").slice(0, 30);
    if (tag && !out.includes(tag)) out.push(tag);
    if (out.length >= 10) break;
  }
  return out;
}

/** Header Content-Disposition an toàn cho tên file Unicode (RFC 6266 / 5987). */
export function contentDisposition(type: "attachment" | "inline", filename: string): string {
  const ascii = filename.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  const encoded = encodeURIComponent(filename).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
