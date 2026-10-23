// Giờ của nhà hàng (Việt Nam, UTC+7), dùng khi đọc và hiển thị giờ đặt bàn
const TIME_ZONE = "Asia/Ho_Chi_Minh";

const MAX_PAGE_SIZE = 50;

// "2026-10-17" theo giờ Việt Nam
function todayInVietnam(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(now);
}

// Bọc handler async để lỗi (Promise reject) được chuyển tới middleware 500.
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// Ép kiểu id từ URL; trả về null nếu không phải số nguyên dương.
function parseId(raw) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}

// Tính trang hiện tại từ ?page=...: không hợp lệ -> trang 1; vượt quá số trang -> trang cuối.
// Trả về { page, totalPages, skip, take } để đưa thẳng vào findMany.
function paginate(total, rawPage, pageSize) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(parseId(rawPage) || 1, totalPages);
  return { page, totalPages, skip: (page - 1) * pageSize, take: pageSize };
}

// Đọc ?page và ?pageSize: không có ?page -> null (trả cả danh sách, không phân trang);
// pageSize hợp lệ được giới hạn trong 1…50, không hợp lệ -> defaultSize.
function pageParams(query, defaultSize) {
  if (!query || query.page === undefined) return null;
  const size = parseId(query.pageSize);
  return {
    rawPage: query.page,
    pageSize: size === null ? defaultSize : Math.min(size, MAX_PAGE_SIZE),
  };
}

// Lấy giá trị chuỗi an toàn từ req.body / req.query (có thể là mảng hoặc undefined).
function str(value) {
  return typeof value === "string" ? value.trim() : "";
}

// Body JSON hợp lệ phải là object thường; mảng, chuỗi, null... coi như body rỗng.
function asObject(body) {
  return body !== null && typeof body === "object" && !Array.isArray(body) ? body : {};
}

// `fields` (kết quả validate) rỗng nghĩa là dữ liệu hợp lệ.
function isEmpty(fields) {
  return Object.keys(fields).length === 0;
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

// Lỗi Prisma khi bản ghi không còn tồn tại lúc update/delete.
function isNotFoundError(err) {
  return err && err.code === "P2025";
}

module.exports = {
  TIME_ZONE,
  todayInVietnam,
  asyncHandler,
  parseId,
  paginate,
  pageParams,
  str,
  asObject,
  isEmpty,
  isHttpUrl,
  isNotFoundError,
};
