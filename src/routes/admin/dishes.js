const express = require("express");
const prisma = require("../../db/prisma");
const { asyncHandler, parseId, paginate, isNotFoundError } = require("../../utils/helpers");
const {
  DISH_CATEGORIES,
  DISH_SORTS,
  parseDishSort,
  validateDish,
  dishToValues,
} = require("../../utils/validators");

const router = express.Router();
const notFound = (res) => res.status(404).render("errors/404");

// Số dòng mỗi trang trong bảng quản trị
const PAGE_SIZE = 10;

const emptyValues = {
  name: "",
  description: "",
  price: "",
  category: "",
  imageUrl: "",
  available: true,
  chefId: "",
  ingredients: {},
};

// Đọc kèm đầu bếp và công thức (nguyên liệu + định lượng)
const dishDetail = {
  chef: true,
  ingredients: {
    include: { ingredient: true },
    orderBy: { ingredient: { name: "asc" } },
  },
};

// Danh sách đầu bếp và nguyên liệu cho ô chọn trong form (và để validate id gửi lên)
async function loadFormOptions() {
  const [chefs, ingredients] = await Promise.all([
    prisma.chef.findMany({ orderBy: { name: "asc" } }),
    prisma.ingredient.findMany({ orderBy: { name: "asc" } }),
  ]);
  return { chefs, ingredients };
}

// 1. GET /admin/dishes?sort=...&page=... — danh sách + sắp xếp + phân trang
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const sort = parseDishSort(req.query.sort);
    const total = await prisma.dish.count();
    const { page, totalPages, skip, take } = paginate(total, req.query.page, PAGE_SIZE);
    const dishes = await prisma.dish.findMany({
      orderBy: DISH_SORTS[sort].orderBy,
      include: { chef: true, _count: { select: { ingredients: true } } },
      skip,
      take,
    });
    res.render("admin/dishes/index", {
      title: "Quản lý món ăn",
      dishes,
      total,
      page,
      totalPages,
      sort,
      sorts: DISH_SORTS,
    });
  })
);

// 2. GET /admin/dishes/new — form thêm
router.get(
  "/new",
  asyncHandler(async (req, res) => {
    const options = await loadFormOptions();
    res.render("admin/dishes/new", {
      title: "Thêm món ăn",
      values: emptyValues,
      errors: [],
      categories: DISH_CATEGORIES,
      ...options,
    });
  })
);

// 3. POST /admin/dishes — thêm bản ghi
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const options = await loadFormOptions();
    const { values, errors, data, recipe } = validateDish(req.body, options);
    if (errors.length > 0) {
      return res.status(400).render("admin/dishes/new", {
        title: "Thêm món ăn",
        values,
        errors,
        categories: DISH_CATEGORIES,
        ...options,
      });
    }

    const created = await prisma.dish.create({
      data: { ...data, ingredients: { create: recipe } },
    });
    res.redirect(303, "/admin/dishes/" + created.id);
  })
);

// 4. GET /admin/dishes/:id — chi tiết
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return notFound(res);

    const dish = await prisma.dish.findUnique({ where: { id }, include: dishDetail });
    if (!dish) return notFound(res);

    res.render("admin/dishes/show", { title: dish.name, dish });
  })
);

// 5. GET /admin/dishes/:id/edit — form sửa
router.get(
  "/:id/edit",
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return notFound(res);

    const dish = await prisma.dish.findUnique({ where: { id }, include: { ingredients: true } });
    if (!dish) return notFound(res);

    const options = await loadFormOptions();
    res.render("admin/dishes/edit", {
      title: "Sửa món ăn",
      dish,
      values: dishToValues(dish),
      errors: [],
      categories: DISH_CATEGORIES,
      ...options,
    });
  })
);

// 6. PATCH /admin/dishes/:id — cập nhật
router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return notFound(res);

    const dish = await prisma.dish.findUnique({ where: { id } });
    if (!dish) return notFound(res);

    const options = await loadFormOptions();
    const { values, errors, data, recipe } = validateDish(req.body, options);
    if (errors.length > 0) {
      return res.status(400).render("admin/dishes/edit", {
        title: "Sửa món ăn",
        dish,
        values,
        errors,
        categories: DISH_CATEGORIES,
        ...options,
      });
    }

    try {
      // Thay toàn bộ công thức cũ bằng công thức mới trong cùng một lệnh update
      await prisma.dish.update({
        where: { id },
        data: { ...data, ingredients: { deleteMany: {}, create: recipe } },
      });
    } catch (err) {
      if (isNotFoundError(err)) return notFound(res);
      throw err;
    }
    res.redirect(303, "/admin/dishes/" + id);
  })
);

// 7. GET /admin/dishes/:id/delete — trang xác nhận xóa
router.get(
  "/:id/delete",
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return notFound(res);

    const dish = await prisma.dish.findUnique({ where: { id } });
    if (!dish) return notFound(res);

    res.render("admin/dishes/delete", { title: "Xóa món ăn", dish });
  })
);

// 8. DELETE /admin/dishes/:id — xóa (công thức của món bị xóa theo, nhờ onDelete: Cascade)
router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return notFound(res);

    const dish = await prisma.dish.findUnique({ where: { id } });
    if (!dish) return notFound(res);

    try {
      await prisma.dish.delete({ where: { id } });
    } catch (err) {
      if (isNotFoundError(err)) return notFound(res);
      throw err;
    }
    res.redirect(303, "/admin/dishes");
  })
);

module.exports = router;
