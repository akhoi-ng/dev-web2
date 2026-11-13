const express = require("express");
const prisma = require("../db/prisma");
const { ok } = require("../http/respond");
const { asyncHandler } = require("../utils/helpers");
const { DISH_CATEGORIES } = require("../utils/validators");

const router = express.Router();

// GET /api/stats — số liệu đầu trang và các ô danh mục (tính trên toàn thực đơn)
router.get(
  "/",
  asyncHandler(async (req, res) => {
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

    ok(res, {
      dishes: overall._count._all,
      categories: tiles.filter((t) => t.count > 0).length,
      chefs: chefCount,
      minPrice: overall._min.price,
      tiles,
    });
  })
);

module.exports = router;
