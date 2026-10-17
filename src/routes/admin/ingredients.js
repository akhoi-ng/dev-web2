const express = require("express");
const prisma = require("../../db/prisma");
const { asyncHandler, parseId, paginate, isNotFoundError } = require("../../utils/helpers");
const {
  INGREDIENT_UNITS,
  validateIngredient,
  ingredientToValues,
} = require("../../utils/validators");

const router = express.Router();
const notFound = (res) => res.status(404).render("errors/404");

// Số dòng mỗi trang trong bảng quản trị
const PAGE_SIZE = 10;

const emptyValues = { name: "", unit: "" };

// 1. GET /admin/ingredients?page=... — danh sách + phân trang
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const total = await prisma.ingredient.count();
    const { page, totalPages, skip, take } = paginate(total, req.query.page, PAGE_SIZE);
    const ingredients = await prisma.ingredient.findMany({
      orderBy: { id: "asc" },
      include: { _count: { select: { dishes: true } } },
      skip,
      take,
    });
    res.render("admin/ingredients/index", {
      title: "Quản lý nguyên liệu",
      ingredients,
      total,
      page,
      totalPages,
    });
  })
);

// 2. GET /admin/ingredients/new — form thêm
router.get("/new", (req, res) => {
  res.render("admin/ingredients/new", {
    title: "Thêm nguyên liệu",
    values: emptyValues,
    errors: [],
    units: INGREDIENT_UNITS,
  });
});

// 3. POST /admin/ingredients — thêm bản ghi
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { values, errors, data } = validateIngredient(req.body);
    if (errors.length > 0) {
      return res.status(400).render("admin/ingredients/new", {
        title: "Thêm nguyên liệu",
        values,
        errors,
        units: INGREDIENT_UNITS,
      });
    }

    const created = await prisma.ingredient.create({ data });
    res.redirect(303, "/admin/ingredients/" + created.id);
  })
);

// 4. GET /admin/ingredients/:id — chi tiết
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return notFound(res);

    const ingredient = await prisma.ingredient.findUnique({
      where: { id },
      include: { dishes: { include: { dish: true }, orderBy: { dishId: "asc" } } },
    });
    if (!ingredient) return notFound(res);

    res.render("admin/ingredients/show", { title: ingredient.name, ingredient });
  })
);

// 5. GET /admin/ingredients/:id/edit — form sửa
router.get(
  "/:id/edit",
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return notFound(res);

    const ingredient = await prisma.ingredient.findUnique({ where: { id } });
    if (!ingredient) return notFound(res);

    res.render("admin/ingredients/edit", {
      title: "Sửa nguyên liệu",
      ingredient,
      values: ingredientToValues(ingredient),
      errors: [],
      units: INGREDIENT_UNITS,
    });
  })
);

// 6. PATCH /admin/ingredients/:id — cập nhật
router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return notFound(res);

    const ingredient = await prisma.ingredient.findUnique({ where: { id } });
    if (!ingredient) return notFound(res);

    const { values, errors, data } = validateIngredient(req.body);
    if (errors.length > 0) {
      return res.status(400).render("admin/ingredients/edit", {
        title: "Sửa nguyên liệu",
        ingredient,
        values,
        errors,
        units: INGREDIENT_UNITS,
      });
    }

    try {
      await prisma.ingredient.update({ where: { id }, data });
    } catch (err) {
      if (isNotFoundError(err)) return notFound(res);
      throw err;
    }
    res.redirect(303, "/admin/ingredients/" + id);
  })
);

// 7. GET /admin/ingredients/:id/delete — trang xác nhận xóa
router.get(
  "/:id/delete",
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return notFound(res);

    const ingredient = await prisma.ingredient.findUnique({
      where: { id },
      include: { _count: { select: { dishes: true } } },
    });
    if (!ingredient) return notFound(res);

    res.render("admin/ingredients/delete", { title: "Xóa nguyên liệu", ingredient });
  })
);

// 8. DELETE /admin/ingredients/:id — xóa
router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return notFound(res);

    const ingredient = await prisma.ingredient.findUnique({ where: { id } });
    if (!ingredient) return notFound(res);

    try {
      await prisma.ingredient.delete({ where: { id } });
    } catch (err) {
      if (isNotFoundError(err)) return notFound(res);
      throw err;
    }
    res.redirect(303, "/admin/ingredients");
  })
);

module.exports = router;
