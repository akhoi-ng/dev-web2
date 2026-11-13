const express = require("express");
const prisma = require("../db/prisma");
const { ok, notFound, validationFailed } = require("../http/respond");
const { asyncHandler, parseId, paginate, pageParams, isEmpty, isNotFoundError } = require("../utils/helpers");
const { validateIngredient } = require("../utils/validators");

const router = express.Router();

// Số nguyên liệu mỗi trang mặc định
const DEFAULT_PAGE_SIZE = 10;

// Chi tiết nguyên liệu: các món dùng nó kèm định lượng
const DETAIL_INCLUDE = {
  dishes: { include: { dish: true }, orderBy: { dishId: "asc" } },
};

// GET /api/ingredients?page&pageSize — danh sách nguyên liệu (kèm số món sử dụng)
// Không có ?page -> trả cả danh sách (không meta); có ?page -> phân trang + meta.
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = {
      orderBy: { id: "asc" },
      include: { _count: { select: { dishes: true } } },
    };

    const paging = pageParams(req.query, DEFAULT_PAGE_SIZE);
    if (!paging) {
      return ok(res, await prisma.ingredient.findMany(query));
    }

    const total = await prisma.ingredient.count();
    const { page, totalPages, skip, take } = paginate(total, paging.rawPage, paging.pageSize);
    const ingredients = await prisma.ingredient.findMany({ ...query, skip, take });
    ok(res, ingredients, { page, totalPages, total, pageSize: paging.pageSize });
  })
);

// GET /api/ingredients/:id — chi tiết nguyên liệu
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return notFound(res, "Nguyên liệu");

    const ingredient = await prisma.ingredient.findUnique({ where: { id }, include: DETAIL_INCLUDE });
    if (!ingredient) return notFound(res, "Nguyên liệu");
    ok(res, ingredient);
  })
);

// POST /api/ingredients — tạo nguyên liệu mới
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { fields, data } = validateIngredient(req.body);
    if (!isEmpty(fields)) return validationFailed(res, fields);

    const ingredient = await prisma.ingredient.create({ data, include: DETAIL_INCLUDE });
    ok(res, ingredient);
  })
);

// PATCH /api/ingredients/:id — sửa một phần
router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return notFound(res, "Nguyên liệu");

    const { fields, data } = validateIngredient(req.body, { partial: true });
    if (!isEmpty(fields)) return validationFailed(res, fields);

    try {
      const ingredient = await prisma.ingredient.update({ where: { id }, data, include: DETAIL_INCLUDE });
      ok(res, ingredient);
    } catch (err) {
      if (isNotFoundError(err)) return notFound(res, "Nguyên liệu");
      throw err;
    }
  })
);

// DELETE /api/ingredients/:id — xóa nguyên liệu (dòng công thức xóa theo nhờ onDelete: Cascade)
router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return notFound(res, "Nguyên liệu");

    try {
      await prisma.ingredient.delete({ where: { id } });
      ok(res, null);
    } catch (err) {
      if (isNotFoundError(err)) return notFound(res, "Nguyên liệu");
      throw err;
    }
  })
);

module.exports = router;
