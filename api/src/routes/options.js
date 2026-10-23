const express = require("express");
const { ok } = require("../http/respond");
const { todayInVietnam } = require("../utils/helpers");
const {
  DISH_CATEGORIES,
  DISH_SORTS,
  INGREDIENT_UNITS,
  BOOKING_SLOTS,
  BOOKING_MAX_GUESTS,
  BOOKING_MAX_DAYS,
  BOOKING_STATUSES,
} = require("../utils/validators");

const router = express.Router();

// GET /api/options — các danh sách cố định cho form và bộ lọc của SPA
router.get("/", (req, res) => {
  const now = new Date();
  const max = new Date(now.getTime() + BOOKING_MAX_DAYS * 24 * 60 * 60 * 1000);
  ok(res, {
    categories: DISH_CATEGORIES,
    sorts: Object.entries(DISH_SORTS).map(([key, { label }]) => ({ key, label })),
    units: INGREDIENT_UNITS,
    booking: {
      slots: BOOKING_SLOTS,
      maxGuests: BOOKING_MAX_GUESTS,
      maxDays: BOOKING_MAX_DAYS,
      statuses: BOOKING_STATUSES,
      minDate: todayInVietnam(now),
      maxDate: todayInVietnam(max),
    },
  });
});

module.exports = router;
