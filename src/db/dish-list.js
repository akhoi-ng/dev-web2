// Danh sách món có tìm kiếm 4 mode + sắp xếp + phân trang ở server (Block 7, bản SSR).
// Dùng chung cho thực đơn (/dishes, /dishes/items) và trang quản trị (/admin/dishes).
const prisma = require("./prisma");
const { buildDishWhere, isRanked, countRanked, rankedIds, orderByIds } = require("./dish-search");
const { paginate } = require("../utils/helpers");
const { DISH_SORTS } = require("../utils/validators");

/*
 * search: kết quả parseDishSearch; sort: khóa của DISH_SORTS; rawPage: ?page thô
 * include: quan hệ cần nạp kèm (đầu bếp, số nguyên liệu...)
 * -> { dishes, total, page, totalPages }
 * fulltext/fuzzy có từ khóa: SQL xếp hạng chọn id (điểm giảm dần, id tăng dần), Prisma nạp
 * bản ghi kèm quan hệ rồi sắp lại theo id; ?sort bị bỏ qua vì thứ tự là độ liên quan.
 */
async function findDishes({ search, sort, rawPage, pageSize, include }) {
  if (isRanked(search)) {
    const total = await countRanked(prisma, search);
    const { page, totalPages, skip, take } = paginate(total, rawPage, pageSize);
    const ids = await rankedIds(prisma, search, { skip, take });
    const rows = await prisma.dish.findMany({ where: { id: { in: ids } }, include });
    return { dishes: orderByIds(rows, ids), total, page, totalPages };
  }

  const where = buildDishWhere(search);
  const total = await prisma.dish.count({ where });
  const { page, totalPages, skip, take } = paginate(total, rawPage, pageSize);
  const dishes = await prisma.dish.findMany({ where, orderBy: DISH_SORTS[sort].orderBy, include, skip, take });
  return { dishes, total, page, totalPages };
}

module.exports = { findDishes };
