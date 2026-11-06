// Tiêu chí tìm kiếm món -> query string trên URL (giữ bộ lọc khi chuyển trang, đổi sắp xếp...).
// URL là nguồn sự thật: route đọc lại bằng parseDishSearch + parseDishSort.

const ADVANCED_ONLY = ["minPrice", "maxPrice", "available", "ingredient"];

// fulltext/fuzzy có từ khóa: kết quả xếp theo độ liên quan, không theo ?sort
function isRankedSearch(search) {
  return (search.mode === "fulltext" || search.mode === "fuzzy") && search.q !== "";
}

/*
 * Chỉ ghi giá trị khác mặc định; bỏ tiêu chí nâng cao khi không ở mode advanced; bỏ sort khi
 * xếp theo độ liên quan. extra: { page, view, ... } (giá trị rỗng bị bỏ qua).
 */
function searchParams(search, sort, extra = {}) {
  const params = new URLSearchParams();
  if (search.mode !== "basic") params.set("mode", search.mode);
  if (search.q) params.set("q", search.q);
  if (search.category) params.set("category", search.category);
  if (search.mode === "advanced") {
    for (const key of ADVANCED_ONLY) {
      const value = search[key];
      if (value !== null && value !== "") params.set(key, String(value));
    }
  }
  if (sort && sort !== "default" && !isRankedSearch(search)) params.set("sort", sort);
  for (const [key, value] of Object.entries(extra)) {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  }
  return params;
}

function hrefWith(path, search, sort, extra) {
  const qs = searchParams(search, sort, extra).toString();
  return path + (qs ? "?" + qs : "");
}

// Có tiêu chí nào khác mặc định (không tính sắp xếp) -> hiện "Xóa bộ lọc"
function hasFilters(search) {
  return searchParams(search, "default").toString() !== "";
}

/*
 * Tiêu chí hiển thị lại trong form khi URL có lỗi: giữ nguyên chuỗi người dùng gõ
 * (search chỉ chứa giá trị đã ép kiểu, giá sai bị thành null).
 */
function formValues(query, search) {
  const s = (v) => (typeof v === "string" ? v.trim() : "");
  return {
    mode: search.mode,
    q: search.q,
    category: search.category,
    minPrice: s(query.minPrice),
    maxPrice: s(query.maxPrice),
    available: s(query.available),
    ingredient: s(query.ingredient),
  };
}

module.exports = { isRankedSearch, searchParams, hrefWith, hasFilters, formValues };
