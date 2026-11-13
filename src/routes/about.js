const express = require("express");
const prisma = require("../db/prisma");
const { asyncHandler } = require("../utils/helpers");

const router = express.Router();

// GET /about — giới thiệu nhà hàng và đội ngũ đầu bếp
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const [chefs, dishCount] = await Promise.all([
      prisma.chef.findMany({
        orderBy: { id: "asc" },
        // Block 9 Bài 2: chỉ đếm món đã đăng (món nháp chưa hiện cho khách)
        include: { _count: { select: { dishes: { where: { status: "published" } } } } },
      }),
      prisma.dish.count({ where: { status: "published" } }),
    ]);

    res.render("about", { title: "Về chúng tôi", chefs, dishCount });
  })
);

module.exports = router;
