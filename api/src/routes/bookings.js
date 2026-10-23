const crypto = require("crypto");
const express = require("express");
const prisma = require("../db/prisma");
const { ok, notFound, validationFailed } = require("../http/respond");
const { asyncHandler, isEmpty } = require("../utils/helpers");
const { validateBooking } = require("../utils/validators");

const router = express.Router();

// POST /api/bookings — khách gửi yêu cầu đặt bàn
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { fields, data } = validateBooking(req.body);
    if (!isEmpty(fields)) return validationFailed(res, fields);

    // Mã 8 ký tự hex; nếu trùng (rất hiếm) thì thử mã khác, tối đa 3 lần
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
    ok(res, created);
  })
);

// GET /api/bookings/:code — tra cứu yêu cầu đặt bàn theo mã
router.get(
  "/:code",
  asyncHandler(async (req, res) => {
    const code = req.params.code;
    if (!/^[0-9a-f]{8}$/.test(code)) return notFound(res, "Yêu cầu đặt bàn");

    const booking = await prisma.booking.findUnique({ where: { code } });
    if (!booking) return notFound(res, "Yêu cầu đặt bàn");
    ok(res, booking);
  })
);

module.exports = router;
