const crypto = require("crypto");
const express = require("express");
const prisma = require("../db/prisma");
const { asyncHandler, todayInVietnam } = require("../utils/helpers");
const {
  BOOKING_SLOTS,
  BOOKING_MAX_GUESTS,
  BOOKING_MAX_DAYS,
  BOOKING_STATUSES,
  validateBooking,
} = require("../utils/validators");

const router = express.Router();
const notFound = (res) => res.status(404).render("errors/404");

const emptyValues = { name: "", phone: "", guests: "2", date: "", time: "", note: "" };

// Dữ liệu cho form: khung giờ, giới hạn ngày cho ô chọn ngày
function formOptions(now = new Date()) {
  const max = new Date(now.getTime() + BOOKING_MAX_DAYS * 24 * 60 * 60 * 1000);
  return {
    slots: BOOKING_SLOTS,
    maxGuests: BOOKING_MAX_GUESTS,
    minDate: todayInVietnam(now),
    maxDate: todayInVietnam(max),
  };
}

// 1. GET /bookings/new — form đặt bàn
router.get("/new", (req, res) => {
  res.render("bookings/new", { title: "Đặt bàn", values: emptyValues, errors: [], ...formOptions() });
});

// 2. POST /bookings — gửi yêu cầu đặt bàn
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { values, errors, data } = validateBooking(req.body);
    if (errors.length > 0) {
      return res.status(400).render("bookings/new", { title: "Đặt bàn", values, errors, ...formOptions() });
    }

    // Mã 8 ký tự hex; nếu trùng (rất hiếm) thì thử mã khác
    let created = null;
    for (let attempt = 0; !created; attempt++) {
      try {
        created = await prisma.booking.create({
          data: { ...data, code: crypto.randomBytes(4).toString("hex") },
        });
      } catch (err) {
        if (err.code !== "P2002" || attempt >= 2) throw err;
      }
    }
    res.redirect(303, "/bookings/" + created.code);
  })
);

// 3. GET /bookings/:code — xác nhận đã nhận yêu cầu
router.get(
  "/:code",
  asyncHandler(async (req, res) => {
    const code = req.params.code;
    if (!/^[0-9a-f]{8}$/.test(code)) return notFound(res);

    const booking = await prisma.booking.findUnique({ where: { code } });
    if (!booking) return notFound(res);

    res.render("bookings/show", { title: "Đã nhận yêu cầu đặt bàn", booking, statuses: BOOKING_STATUSES });
  })
);

module.exports = router;
