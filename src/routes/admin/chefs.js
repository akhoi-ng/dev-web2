const express = require("express");
const prisma = require("../../db/prisma");
const { asyncHandler, parseId, paginate, isNotFoundError } = require("../../utils/helpers");
const { validateChef, chefToValues } = require("../../utils/validators");

const router = express.Router();
const notFound = (res) => res.status(404).render("errors/404");

// Số dòng mỗi trang trong bảng quản trị
const PAGE_SIZE = 10;

const emptyValues = { name: "", specialty: "", imageUrl: "" };

// 1. GET /admin/chefs?page=... — danh sách + phân trang
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const total = await prisma.chef.count();
    const { page, totalPages, skip, take } = paginate(total, req.query.page, PAGE_SIZE);
    const chefs = await prisma.chef.findMany({
      orderBy: { id: "asc" },
      include: { _count: { select: { dishes: true } } },
      skip,
      take,
    });
    res.render("admin/chefs/index", { title: "Quản lý đầu bếp", chefs, total, page, totalPages });
  })
);

// 2. GET /admin/chefs/new — form thêm
router.get("/new", (req, res) => {
  res.render("admin/chefs/new", { title: "Thêm đầu bếp", values: emptyValues, errors: [] });
});

// 3. POST /admin/chefs — thêm bản ghi
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { values, errors, data } = validateChef(req.body);
    if (errors.length > 0) {
      return res
        .status(400)
        .render("admin/chefs/new", { title: "Thêm đầu bếp", values, errors });
    }

    const created = await prisma.chef.create({ data });
    res.redirect(303, "/admin/chefs/" + created.id);
  })
);

// 4. GET /admin/chefs/:id — chi tiết
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return notFound(res);

    const chef = await prisma.chef.findUnique({
      where: { id },
      include: { dishes: { orderBy: { id: "asc" } } },
    });
    if (!chef) return notFound(res);

    res.render("admin/chefs/show", { title: chef.name, chef });
  })
);

// 5. GET /admin/chefs/:id/edit — form sửa
router.get(
  "/:id/edit",
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return notFound(res);

    const chef = await prisma.chef.findUnique({ where: { id } });
    if (!chef) return notFound(res);

    res.render("admin/chefs/edit", {
      title: "Sửa đầu bếp",
      chef,
      values: chefToValues(chef),
      errors: [],
    });
  })
);

// 6. PATCH /admin/chefs/:id — cập nhật
router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return notFound(res);

    const chef = await prisma.chef.findUnique({ where: { id } });
    if (!chef) return notFound(res);

    const { values, errors, data } = validateChef(req.body);
    if (errors.length > 0) {
      return res
        .status(400)
        .render("admin/chefs/edit", { title: "Sửa đầu bếp", chef, values, errors });
    }

    try {
      await prisma.chef.update({ where: { id }, data });
    } catch (err) {
      if (isNotFoundError(err)) return notFound(res);
      throw err;
    }
    res.redirect(303, "/admin/chefs/" + id);
  })
);

// 7. GET /admin/chefs/:id/delete — trang xác nhận xóa
router.get(
  "/:id/delete",
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return notFound(res);

    const chef = await prisma.chef.findUnique({
      where: { id },
      include: { _count: { select: { dishes: true } } },
    });
    if (!chef) return notFound(res);

    res.render("admin/chefs/delete", { title: "Xóa đầu bếp", chef });
  })
);

// 8. DELETE /admin/chefs/:id — xóa
router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return notFound(res);

    const chef = await prisma.chef.findUnique({ where: { id } });
    if (!chef) return notFound(res);

    try {
      await prisma.chef.delete({ where: { id } });
    } catch (err) {
      if (isNotFoundError(err)) return notFound(res);
      throw err;
    }
    res.redirect(303, "/admin/chefs");
  })
);

module.exports = router;
