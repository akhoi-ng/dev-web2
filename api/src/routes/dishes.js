const express = require("express");
const prisma = require("../db/prisma");
const { ok, notFound, validationFailed } = require("../http/respond");
const { asyncHandler, parseId, paginate, pageParams, isEmpty, isNotFoundError, escapeLike } = require("../utils/helpers");
const { validateDish, DISH_CATEGORIES, DISH_SORTS, parseDishSort } = require("../utils/validators");

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

// Danh sách đầu bếp / nguyên liệu để validate chefId và công thức
async function loadRefs() {
  const [chefs, ingredients] = await Promise.all([
    prisma.chef.findMany({ select: { id: true } }),
    prisma.ingredient.findMany({ select: { id: true, name: true } }),
  ]);
  return { chefs, ingredients };
}

// GET /api/dishes?q&category&sort&page&pageSize — danh sách + tìm kiếm + lọc + sắp xếp
// Không có ?page -> trả cả danh sách (không meta); có ?page -> phân trang + meta.
router.get(
  "/",
  asyncHandler(async (req, res) => {
    // ?q=a&q=b khiến req.query.q là mảng -> bỏ qua, coi như rỗng
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    // Chỉ nhận danh mục có trong danh sách; giá trị lạ coi như "Tất cả"
    const category =
      typeof req.query.category === "string" && DISH_CATEGORIES.includes(req.query.category)
        ? req.query.category
        : "";
    const sort = parseDishSort(req.query.sort);

    const where = { name: { contains: escapeLike(q), mode: "insensitive" } };
    if (category) where.category = category;

    const query = {
      where,
      orderBy: DISH_SORTS[sort].orderBy,
      include: { chef: true, _count: { select: { ingredients: true } } },
    };

    const paging = pageParams(req.query, DEFAULT_PAGE_SIZE);
    if (!paging) {
      return ok(res, await prisma.dish.findMany(query));
    }

    const total = await prisma.dish.count({ where });
    const { page, totalPages, skip, take } = paginate(total, paging.rawPage, paging.pageSize);
    const dishes = await prisma.dish.findMany({ ...query, skip, take });
    ok(res, dishes, { page, totalPages, total, pageSize: paging.pageSize });
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
