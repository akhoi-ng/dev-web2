const express = require("express");
const prisma = require("../db/prisma");
const { asyncHandler, parseId, paginate } = require("../utils/helpers");
const { DISH_CATEGORIES, DISH_SORTS, parseDishSort } = require("../utils/validators");

const router = express.Router();

// Số món mỗi trang trên thực đơn (lưới 3 cột -> 3 hàng)
const PAGE_SIZE = 9;

// GET /dishes?q=...&category=...&sort=... — danh sách + tìm kiếm + lọc theo danh mục + sắp xếp
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

    const where = { name: { contains: q, mode: "insensitive" } };
    if (category) where.category = category;

    const total = await prisma.dish.count({ where });
    const { page, totalPages, skip, take } = paginate(total, req.query.page, PAGE_SIZE);

    const dishes = await prisma.dish.findMany({
      where,
      orderBy: DISH_SORTS[sort].orderBy,
      include: { chef: true },
      skip,
      take,
    });

    // Số liệu cho phần đầu trang và các ô danh mục (tính trên toàn thực đơn, không theo bộ lọc)
    const [byCategory, chefCount, overall, coverImages] = await Promise.all([
      prisma.dish.groupBy({ by: ["category"], _count: { _all: true } }),
      prisma.chef.count(),
      prisma.dish.aggregate({ _count: { _all: true }, _min: { price: true } }),
      // Ảnh đầu tiên của mỗi danh mục làm ảnh bìa cho ô danh mục
      prisma.dish.findMany({
        where: { imageUrl: { not: null } },
        distinct: ["category"],
        orderBy: { id: "asc" },
        select: { category: true, imageUrl: true },
      }),
    ]);
    const tiles = DISH_CATEGORIES.map((name) => ({
      name,
      count: byCategory.find((g) => g.category === name)?._count._all || 0,
      imageUrl: coverImages.find((c) => c.category === name)?.imageUrl || null,
    }));
    const stats = {
      dishes: overall._count._all,
      categories: tiles.filter((t) => t.count > 0).length,
      chefs: chefCount,
      minPrice: overall._min.price,
    };

    res.render("dishes/index", {
      tiles,
      stats,
      title: "Thực đơn",
      dishes,
      total,
      page,
      totalPages,
      q,
      category,
      categories: DISH_CATEGORIES,
      sort,
      sorts: DISH_SORTS,
    });
  })
);

// GET /dishes/:id — chi tiết món ăn
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return res.status(404).render("errors/404");

    const dish = await prisma.dish.findUnique({
      where: { id },
      include: {
        chef: true,
        ingredients: {
          include: { ingredient: true },
          orderBy: { ingredient: { name: "asc" } },
        },
      },
    });
    if (!dish) return res.status(404).render("errors/404");

    res.render("dishes/show", { title: dish.name, dish });
  })
);

module.exports = router;
