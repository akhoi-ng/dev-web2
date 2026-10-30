const express = require("express");
const prisma = require("../db/prisma");
const { buildDishWhere, isRanked, countRanked, rankedIds, orderByIds } = require("../db/dish-search");
const { ok, notFound, validationFailed } = require("../http/respond");
const { asyncHandler, parseId, paginate, pageParams, isEmpty, isNotFoundError } = require("../utils/helpers");
const { validateDish, DISH_SORTS, parseDishSort, parseDishSearch } = require("../utils/validators");

const router = express.Router();

// Số món mỗi trang mặc định (lưới 3 cột -> 3 hàng)
const DEFAULT_PAGE_SIZE = 9;

// Chi tiết món: đầu bếp + công thức sắp theo tên nguyên liệu
const DETAIL_INCLUDE = {
  chef: true,
  ingredients: {
    include: { ingredient: true },
    orderBy: { ingredient: { name: "asc" } },
  },
};

// Danh sách món: đầu bếp + số nguyên liệu trong công thức
const LIST_INCLUDE = { chef: true, _count: { select: { ingredients: true } } };

// Danh sách đầu bếp / nguyên liệu để validate chefId và công thức
async function loadRefs() {
  const [chefs, ingredients] = await Promise.all([
    prisma.chef.findMany({ select: { id: true } }),
    prisma.ingredient.findMany({ select: { id: true, name: true } }),
  ]);
  return { chefs, ingredients };
}

// GET /api/dishes?mode&q&category&minPrice&maxPrice&available&ingredient&sort&page&pageSize
// — danh sách + tìm kiếm 4 mode + lọc + sắp xếp (tham số: xem parseDishSearch).
// Không có ?page -> trả cả danh sách (không meta); có ?page -> phân trang + meta.
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { fields, search } = parseDishSearch(req.query);
    if (!isEmpty(fields)) return validationFailed(res, fields);
    const paging = pageParams(req.query, DEFAULT_PAGE_SIZE);

    // fulltext/fuzzy có từ khóa: SQL xếp hạng chọn id (điểm giảm dần, id tăng dần), Prisma nạp
    // bản ghi kèm quan hệ rồi sắp lại theo id. ?sort bị bỏ qua vì thứ tự là độ liên quan.
    if (isRanked(search)) {
      const load = async (ids) =>
        orderByIds(await prisma.dish.findMany({ where: { id: { in: ids } }, include: LIST_INCLUDE }), ids);
      if (!paging) return ok(res, await load(await rankedIds(prisma, search, null)));

      const total = await countRanked(prisma, search);
      const { page, totalPages, skip, take } = paginate(total, paging.rawPage, paging.pageSize);
      const dishes = await load(await rankedIds(prisma, search, { skip, take }));
      return ok(res, dishes, { page, totalPages, total, pageSize: paging.pageSize, mode: search.mode });
    }

    const sort = parseDishSort(req.query.sort);
    const where = buildDishWhere(search);
    const query = { where, orderBy: DISH_SORTS[sort].orderBy, include: LIST_INCLUDE };

    if (!paging) {
      return ok(res, await prisma.dish.findMany(query));
    }

    const total = await prisma.dish.count({ where });
    const { page, totalPages, skip, take } = paginate(total, paging.rawPage, paging.pageSize);
    const dishes = await prisma.dish.findMany({ ...query, skip, take });
    ok(res, dishes, { page, totalPages, total, pageSize: paging.pageSize, mode: search.mode });
  })
);

// GET /api/dishes/:id — chi tiết món ăn
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return notFound(res, "Món ăn");

    const dish = await prisma.dish.findUnique({ where: { id }, include: DETAIL_INCLUDE });
    if (!dish) return notFound(res, "Món ăn");
    ok(res, dish);
  })
);

// POST /api/dishes — tạo món mới (kèm công thức)
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { chefs, ingredients } = await loadRefs();
    const { fields, data, recipe } = validateDish(req.body, { chefs, ingredients });
    if (!isEmpty(fields)) return validationFailed(res, fields);

    const dish = await prisma.dish.create({
      data: { ...data, ingredients: { create: recipe } },
      include: DETAIL_INCLUDE,
    });
    ok(res, dish);
  })
);

// PATCH /api/dishes/:id — sửa một phần; có `ingredients` thì thay toàn bộ công thức
router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return notFound(res, "Món ăn");

    const { chefs, ingredients } = await loadRefs();
    const { fields, data, recipe } = validateDish(req.body, { chefs, ingredients, partial: true });
    if (!isEmpty(fields)) return validationFailed(res, fields);

    if (recipe !== undefined) data.ingredients = { deleteMany: {}, create: recipe };

    try {
      const dish = await prisma.dish.update({ where: { id }, data, include: DETAIL_INCLUDE });
      ok(res, dish);
    } catch (err) {
      if (isNotFoundError(err)) return notFound(res, "Món ăn");
      throw err;
    }
  })
);

// DELETE /api/dishes/:id — xóa món (công thức xóa theo nhờ onDelete: Cascade)
router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return notFound(res, "Món ăn");

    try {
      await prisma.dish.delete({ where: { id } });
      ok(res, null);
    } catch (err) {
      if (isNotFoundError(err)) return notFound(res, "Món ăn");
      throw err;
    }
  })
);

module.exports = router;
