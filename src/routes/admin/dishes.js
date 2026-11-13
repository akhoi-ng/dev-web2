const express = require("express");
const prisma = require("../../db/prisma");
const { findDishes } = require("../../db/dish-list");
const { asyncHandler, parseId, isNotFoundError } = require("../../utils/helpers");
const {
  DISH_CATEGORIES,
  DISH_SORTS,
  SEARCH_MODES,
  parseDishSort,
  parseDishSearch,
  validateDish,
  dishToValues,
} = require("../../utils/validators");
const { isRankedSearch, hrefWith, hasFilters, formValues } = require("../../utils/dish-query");
const { canAssignDish, canCreateDish, canEditDish, dishEditScope } = require("../../auth/policy");
const { forbidden } = require("../../auth/session");

// RBAC (đọc / tạo / sửa / xóa theo role) đã kiểm tra ở app.js cho mọi route /admin/*.
// File này thêm ABAC: Editor chỉ tạo món cho đầu bếp của mình, chỉ sửa món draft của đầu bếp
// mình; chefId và status chỉ Admin được đổi. chefId của Editor lấy từ tài khoản (req.user, đọc
// từ DB), không bao giờ từ form.

const router = express.Router();
const notFound = (res) => res.status(404).render("errors/404");
const CANNOT_CREATE = "Tài khoản editor chưa được gắn với đầu bếp nào nên chưa thêm được món. Liên hệ quản trị viên.";
const CANNOT_EDIT = "Editor chỉ sửa được món ở trạng thái nháp (draft) của đầu bếp mình phụ trách.";

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
  status: "draft",
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

// 1. GET /admin/dishes?mode&q&...&sort&page — bảng món + tìm kiếm 4 mode + sắp xếp + phân trang số trang
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { fields, search } = parseDishSearch(req.query);
    const sort = parseDishSort(req.query.sort);
    const searchErrors = Object.values(fields);
    const result =
      searchErrors.length > 0
        ? { dishes: [], total: 0, page: 1, totalPages: 1 }
        : await findDishes({
            search,
            sort,
            rawPage: req.query.page,
            pageSize: PAGE_SIZE,
            include: { chef: true, _count: { select: { ingredients: true } } },
          });
    res.render("admin/dishes/index", {
      title: "Quản lý món ăn",
      ...result,
      search,
      sort,
      searchErrors,
      form: formValues(req.query, search),
      ranked: isRankedSearch(search),
      filtered: hasFilters(search),
      sorts: DISH_SORTS,
      modes: SEARCH_MODES,
      // Giữ tiêu chí + sắp xếp khi chuyển trang; trang 1 không ghi lên URL
      pageHref: (p) => hrefWith("/admin/dishes", search, sort, { page: p > 1 ? p : "" }),
    });
  })
);

// 2. GET /admin/dishes/new — form thêm
router.get(
  "/new",
  asyncHandler(async (req, res) => {
    if (!canCreateDish(req.user)) return forbidden(res, CANNOT_CREATE);
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
    if (!canCreateDish(req.user)) return forbidden(res, CANNOT_CREATE);
    const canAssign = canAssignDish(req.user);
    const options = await loadFormOptions();
    const { values, errors, data, recipe } = validateDish(req.body, { ...options, canAssign });
    if (errors.length > 0) {
      return res.status(400).render("admin/dishes/new", {
        title: "Thêm món ăn",
        values,
        errors,
        categories: DISH_CATEGORIES,
        ...options,
      });
    }

    // Editor: món mới thuộc đầu bếp của tài khoản và luôn là draft (body.chefId/status bị bỏ qua)
    if (!canAssign) {
      data.chefId = req.user.chefId;
      data.status = "draft";
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
    if (!canEditDish(req.user, dish)) return forbidden(res, CANNOT_EDIT);

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
    // Kiểm tra sớm để không hiện lỗi validate cho món không được sửa; điều kiện thật nằm ở UPDATE
    const scope = dishEditScope(req.user);
    if (!scope || !canEditDish(req.user, dish)) return forbidden(res, CANNOT_EDIT);

    const options = await loadFormOptions();
    const { values, errors, data, recipe } = validateDish(req.body, { ...options, canAssign: canAssignDish(req.user) });
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

    // Điều kiện ABAC (scope) nằm trong WHERE của câu UPDATE: món bị đổi status / chefId giữa lúc
    // mở form và lúc gửi thì UPDATE không khớp dòng nào -> 403, công thức cũng không bị thay.
    // Chạy trong transaction để công thức chỉ thay khi UPDATE món thành công.
    const updated = await prisma.$transaction(async (tx) => {
      const r = await tx.dish.updateMany({ where: { id, ...scope }, data });
      if (r.count !== 1) return false;
      await tx.dishIngredient.deleteMany({ where: { dishId: id } });
      if (recipe.length) await tx.dishIngredient.createMany({ data: recipe.map((row) => ({ ...row, dishId: id })) });
      return true;
    });
    if (!updated) {
      const still = await prisma.dish.findUnique({ where: { id }, select: { id: true } });
      return still ? forbidden(res, CANNOT_EDIT) : notFound(res);
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
