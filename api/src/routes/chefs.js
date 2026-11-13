const express = require("express");
const prisma = require("../db/prisma");
const { ok, notFound, validationFailed } = require("../http/respond");
const { asyncHandler, parseId, paginate, pageParams, isEmpty, isNotFoundError } = require("../utils/helpers");
const { validateChef } = require("../utils/validators");

const router = express.Router();

// Số đầu bếp mỗi trang mặc định
const DEFAULT_PAGE_SIZE = 10;

// Chi tiết đầu bếp: các món phụ trách
const DETAIL_INCLUDE = { dishes: { orderBy: { id: "asc" } } };

// GET /api/chefs?page&pageSize — danh sách đầu bếp (kèm số món phụ trách)
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
      return ok(res, await prisma.chef.findMany(query));
    }

    const total = await prisma.chef.count();
    const { page, totalPages, skip, take } = paginate(total, paging.rawPage, paging.pageSize);
    const chefs = await prisma.chef.findMany({ ...query, skip, take });
    ok(res, chefs, { page, totalPages, total, pageSize: paging.pageSize });
  })
);

// GET /api/chefs/:id — chi tiết đầu bếp
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return notFound(res, "Đầu bếp");

    const chef = await prisma.chef.findUnique({ where: { id }, include: DETAIL_INCLUDE });
    if (!chef) return notFound(res, "Đầu bếp");
    ok(res, chef);
  })
);

// POST /api/chefs — tạo đầu bếp mới
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { fields, data } = validateChef(req.body);
    if (!isEmpty(fields)) return validationFailed(res, fields);

    const chef = await prisma.chef.create({ data, include: DETAIL_INCLUDE });
    ok(res, chef);
  })
);

// PATCH /api/chefs/:id — sửa một phần
router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return notFound(res, "Đầu bếp");

    const { fields, data } = validateChef(req.body, { partial: true });
    if (!isEmpty(fields)) return validationFailed(res, fields);

    try {
      const chef = await prisma.chef.update({ where: { id }, data, include: DETAIL_INCLUDE });
      ok(res, chef);
    } catch (err) {
      if (isNotFoundError(err)) return notFound(res, "Đầu bếp");
      throw err;
    }
  })
);

// DELETE /api/chefs/:id — xóa đầu bếp (các món còn lại, chefId = null nhờ onDelete: SetNull)
router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return notFound(res, "Đầu bếp");

    try {
      await prisma.chef.delete({ where: { id } });
      ok(res, null);
    } catch (err) {
      if (isNotFoundError(err)) return notFound(res, "Đầu bếp");
      throw err;
    }
  })
);

module.exports = router;
