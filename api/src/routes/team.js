const express = require("express");
const prisma = require("../db/prisma");
const { ok } = require("../http/respond");
const { asyncHandler } = require("../utils/helpers");

const router = express.Router();

// GET /api/team — đội ngũ đầu bếp cho trang "Về chúng tôi" của khách (công khai, chỉ đọc).
// Block 9 khóa mọi endpoint /api/chefs sau Bearer token, nên trang công khai lấy đúng các trường
// cần hiển thị ở đây thay vì gọi /api/chefs.
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const chefs = await prisma.chef.findMany({
      orderBy: { id: "asc" },
      select: { id: true, name: true, specialty: true, imageUrl: true, _count: { select: { dishes: true } } },
    });
    ok(res, chefs);
  })
);

module.exports = router;
