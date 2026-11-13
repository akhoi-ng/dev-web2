// Tiêu chí tìm kiếm món <-> URL <-> query của API. Thuần JS (chạy được dưới node --test).
// URL là nguồn sự thật: mọi trang đọc tiêu chí bằng readCriteria và ghi lại bằng writeParams.

export const CRITERIA_KEYS = ["mode", "q", "category", "minPrice", "maxPrice", "available", "ingredient", "sort"];
const DEFAULTS = { mode: "basic", sort: "default" };
const ADVANCED_ONLY = ["minPrice", "maxPrice", "available", "ingredient"];

// Tiêu chí rỗng (mọi giá trị là chuỗi, như trên URL)
export const EMPTY_CRITERIA = Object.fromEntries(CRITERIA_KEYS.map((k) => [k, DEFAULTS[k] || ""]));

export function readCriteria(searchParams) {
  const criteria = {};
  for (const key of CRITERIA_KEYS) {
    const value = (searchParams.get(key) || "").trim();
    criteria[key] = value || DEFAULTS[key] || "";
  }
  return criteria;
}

// fulltext/fuzzy có từ khóa: kết quả xếp theo độ liên quan, không theo ?sort
export function isRankedCriteria(criteria) {
  return (criteria.mode === "fulltext" || criteria.mode === "fuzzy") && criteria.q !== "";
}

// Query gửi API: bỏ giá trị rỗng/mặc định, bỏ tiêu chí nâng cao khi không ở mode advanced,
// bỏ sort khi xếp theo độ liên quan.
export function apiQuery(criteria) {
  const query = {};
  for (const key of CRITERIA_KEYS) {
    const value = criteria[key];
    if (!value || value === DEFAULTS[key]) continue;
    if (ADVANCED_ONLY.includes(key) && criteria.mode !== "advanced") continue;
    if (key === "sort" && isRankedCriteria(criteria)) continue;
    query[key] = value;
  }
  return query;
}

// URLSearchParams của trang: chỉ ghi giá trị khác mặc định, rồi thêm `extra` (page, view...)
export function writeParams(criteria, extra = {}) {
  const params = new URLSearchParams(apiQuery(criteria));
  for (const [key, value] of Object.entries(extra)) {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  }
  return params;
}

// Khóa ổn định của một lần tìm: hai tiêu chí cho cùng query API thì cùng khóa
export function criteriaKey(criteria) {
  return JSON.stringify(apiQuery(criteria));
}

export function hasFilters(criteria) {
  return Object.keys(apiQuery({ ...criteria, sort: DEFAULTS.sort })).length > 0;
}
