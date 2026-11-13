const express = require("express");
const prisma = require("../db/prisma");
const { ok, notFound, validationFailed } = require("../http/respond");
const { asyncHandler, parseId, isEmpty, isNotFoundError, todayInVietnam } = require("../utils/helpers");
const { validateBookingStatus } = require("../utils/validators");

const router = express.Router();

// GET /api/admin/bookings?show=all — mặc định chỉ lịch từ hôm nay (giờ VN) trở đi; không phân trang
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const startOfToday = new Date(todayInVietnam() + "T00:00:00+07:00");
    const bookings = await prisma.booking.findMany({
      where: req.query.show === "all" ? {} : { bookedAt: { gte: startOfToday } },
      orderBy: [{ bookedAt: "asc" }, { id: "asc" }],
    });
    ok(res, bookings);
  })
);

// PATCH /api/admin/bookings/:id — đổi trạng thái (xác nhận / hủy / chờ)
router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return notFound(res, "Yêu cầu đặt bàn");

    const { fields, data } = validateBookingStatus(req.body);
    if (!isEmpty(fields)) return validationFailed(res, fields);

    try {
      const booking = await prisma.booking.update({ where: { id }, data });
      ok(res, booking);
    } catch (err) {
      if (isNotFoundError(err)) return notFound(res, "Yêu cầu đặt bàn");
      throw err;
    }
  })
);

module.exports = router;
