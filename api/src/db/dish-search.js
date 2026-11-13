// Tìm kiếm món theo 4 mode (search lấy từ parseDishSearch trong utils/validators.js):
//  - basic / advanced: điều kiện Prisma `where` (ILIKE, so sánh giá, quan hệ nguyên liệu)
//  - fulltext / fuzzy: SQL có tham số qua $queryRaw, xếp theo điểm (xem các hàm ranked*)
const { Prisma } = require("@prisma/client");
const { escapeLike } = require("../utils/helpers");

const contains = (text) => ({ contains: escapeLike(text), mode: "insensitive" });

// Điều kiện Prisma cho basic/advanced. basic chỉ có q + category vì parseDishSearch
// đã để trống các tiêu chí nâng cao ở mode khác advanced.
function buildDishWhere(search) {
  const where = {};
  if (search.q) where.name = contains(search.q);
  if (search.category) where.category = search.category;

  const price = {};
  if (search.minPrice !== null) price.gte = search.minPrice;
  if (search.maxPrice !== null) price.lte = search.maxPrice;
  if (Object.keys(price).length) where.price = price;

  if (search.available !== null) where.available = search.available;
  if (search.ingredient) where.ingredients = { some: { ingredient: { name: contains(search.ingredient) } } };
  return where;
}

// fulltext/fuzzy chỉ xếp theo điểm khi có từ khóa; q rỗng thì như basic.
function isRanked(search) {
  return (search.mode === "fulltext" || search.mode === "fuzzy") && search.q !== "";
}

// Ngưỡng word_similarity của fuzzy (công bố trong README)
const FUZZY_THRESHOLD = 0.3;

// Document full-text: trùng y hệt biểu thức của index dishes_fts_idx (prisma/search.sql)
const FTS_DOCUMENT = Prisma.sql`to_tsvector('simple', name || ' ' || coalesce(description, ''))`;
const ftsQuery = (q) => Prisma.sql`plainto_tsquery('simple', ${q})`;

// Điểm gần đúng, bỏ dấu cả hai phía: pg_trgm coi "ú" khác "u", nên không có unaccent thì
// "bun" và "bún" chỉ chung 1/4 trigram (0.25 < 0.3) và không khớp.
const fuzzyScore = (q) => Prisma.sql`word_similarity(unaccent(${q}), unaccent(name))`;

// Điều kiện WHERE dùng chung cho câu đếm và câu lấy id, nên total và items cùng một predicate.
function rankedFilterSql(search) {
  const text =
    search.mode === "fulltext"
      ? Prisma.sql`${FTS_DOCUMENT} @@ ${ftsQuery(search.q)}`
      : Prisma.sql`${fuzzyScore(search.q)} >= ${FUZZY_THRESHOLD}`;
  return search.category ? Prisma.sql`${text} AND category = ${search.category}` : text;
}

function rankedScoreSql(search) {
  return search.mode === "fulltext"
    ? Prisma.sql`ts_rank(${FTS_DOCUMENT}, ${ftsQuery(search.q)})`
    : fuzzyScore(search.q);
}

async function countRanked(prisma, search) {
  const [row] = await prisma.$queryRaw`SELECT count(*) AS total FROM dishes WHERE ${rankedFilterSql(search)}`;
  return Number(row.total); // count(*) là bigint
}

// id theo điểm giảm dần, cùng điểm thì id tăng dần (thứ tự ổn định khi phân trang).
// paging = { skip, take } hoặc null (lấy hết).
async function rankedIds(prisma, search, paging) {
  const limit = paging ? Prisma.sql`LIMIT ${paging.take} OFFSET ${paging.skip}` : Prisma.empty;
  const rows = await prisma.$queryRaw`
    SELECT id FROM dishes
    WHERE ${rankedFilterSql(search)}
    ORDER BY ${rankedScoreSql(search)} DESC, id ASC
    ${limit}`;
  return rows.map((r) => r.id);
}

// findMany({ id: { in } }) không giữ thứ tự: sắp lại theo danh sách id đã xếp hạng.
function orderByIds(rows, ids) {
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

module.exports = {
  FUZZY_THRESHOLD,
  buildDishWhere,
  isRanked,
  rankedFilterSql,
  rankedScoreSql,
  countRanked,
  rankedIds,
  orderByIds,
};
