const express = require("express");
const prisma = require("../../db/prisma");
const { asyncHandler, parseId, str, isNotFoundError, todayInVietnam } = require("../../utils/helpers");
const { BOOKING_STATUSES } = require("../../utils/validators");

const router = express.Router();
const notFound = (res) => res.status(404).render("errors/404");

// ?show=all hiện cả lịch đã qua; mặc định chỉ hiện lịch từ hôm nay trở đi
async function renderList(req, res, status = 200, errors = []) {
  const showAll = req.query.show === "all";
  const startOfToday = new Date(todayInVietnam() + "T00:00:00+07:00");
  const bookings = await prisma.booking.findMany({
    where: showAll ? {} : { bookedAt: { gte: startOfToday } },
    orderBy: [{ bookedAt: "asc" }, { id: "asc" }],
  });
  res.status(status).render("admin/bookings/index", {
    title: "Đặt bàn",
    bookings,
    showAll,
    errors,
    statuses: BOOKING_STATUSES,
  });
}

// 1. GET /admin/bookings — danh sách yêu cầu đặt bàn
router.get(
  "/",
  asyncHandler(async (req, res) => renderList(req, res))
);

// 2. PATCH /admin/bookings/:id — đổi trạng thái (xác nhận / hủy / chờ)
router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return notFound(res);

    const status = str(req.body.status);
    if (!Object.hasOwn(BOOKING_STATUSES, status)) {
      return renderList(req, res, 400, ["Trạng thái không hợp lệ."]);
    }

    try {
      await prisma.booking.update({ where: { id }, data: { status } });
    } catch (err) {
      if (isNotFoundError(err)) return notFound(res);
      throw err;
    }
    res.redirect(303, "/admin/bookings");
  })
);

module.exports = router;
