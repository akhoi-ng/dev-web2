const express = require("express");
const prisma = require("../db/prisma");
const { findDishes } = require("../db/dish-list");
const { asyncHandler, parseId } = require("../utils/helpers");
const { DISH_CATEGORIES, DISH_SORTS, SEARCH_MODES, parseDishSort, parseDishSearch } = require("../utils/validators");
const { isRankedSearch, hrefWith, hasFilters, formValues } = require("../utils/dish-query");

const router = express.Router();

// Số món mỗi trang trên thực đơn (lưới 3 cột -> 3 hàng)
const PAGE_SIZE = 9;
const LIST_INCLUDE = { chef: true };

// Ba kiểu phân trang của thực đơn, lưu trên URL ?view=pages|more|scroll
const MENU_VIEWS = { pages: "Số trang", more: "Tải thêm", scroll: "Cuộn vô hạn" };
const parseView = (raw) => (typeof raw === "string" && Object.hasOwn(MENU_VIEWS, raw) ? raw : "pages");

// Số liệu cho phần đầu trang và các ô danh mục (tính trên toàn thực đơn, không theo bộ lọc)
async function loadMenuStats() {
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
  return { tiles, stats };
}

// GET /dishes?mode&q&category&minPrice&maxPrice&available&ingredient&sort&view&page
// — thực đơn: tìm kiếm 4 mode + lọc + sắp xếp + 3 kiểu phân trang
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { fields, search } = parseDishSearch(req.query);
    const sort = parseDishSort(req.query.sort);
    const view = parseView(req.query.view);
    const searchErrors = Object.values(fields);

    // "Tải thêm" / "Cuộn vô hạn" luôn bắt đầu từ trang 1; trang sau lấy qua /dishes/items
    const result =
      searchErrors.length > 0
        ? { dishes: [], total: 0, page: 1, totalPages: 1 }
        : await findDishes({
            search,
            sort,
            rawPage: view === "pages" ? req.query.page : 1,
            pageSize: PAGE_SIZE,
            include: LIST_INCLUDE,
          });
    const { tiles, stats } = await loadMenuStats();

    // Link giữ nguyên tiêu chí; #thuc-don để trang mới cuộn tới danh sách
    const menuHref = (over = {}, extra = {}) =>
      hrefWith("/dishes", { ...search, ...over }, over.sort || sort, { view: view === "pages" ? "" : view, ...extra }) +
      "#thuc-don";

    res.render("dishes/index", {
      title: "Thực đơn",
      tiles,
      stats,
      ...result,
      search,
      sort,
      view,
      searchErrors,
      form: formValues(req.query, search),
      ranked: isRankedSearch(search),
      filtered: hasFilters(search),
      categories: DISH_CATEGORIES,
      sorts: DISH_SORTS,
      modes: SEARCH_MODES,
      views: MENU_VIEWS,
      menuHref,
      viewHref: (v) => hrefWith("/dishes", search, sort, { view: v === "pages" ? "" : v }) + "#thuc-don",
      pageHref: (p) => hrefWith("/dishes", search, sort, { page: p > 1 ? p : "" }) + "#thuc-don",
      // Trang tiếp theo cho "Tải thêm" / "Cuộn vô hạn" (đọc bằng fetch, chỉ GET)
      itemsHref: (p) => hrefWith("/dishes/items", search, sort, { page: p }),
    });
  })
);

// GET /dishes/items?<tiêu chí>&page=n — một trang thẻ món (HTML) cho "Tải thêm" / "Cuộn vô hạn".
// Header X-Total, X-Page, X-Total-Pages cho script biết còn trang sau hay không.
router.get(
  "/items",
  asyncHandler(async (req, res) => {
    const { fields, search } = parseDishSearch(req.query);
    if (Object.keys(fields).length > 0) return res.status(400).send("");
    const sort = parseDishSort(req.query.sort);
    const result = await findDishes({ search, sort, rawPage: req.query.page, pageSize: PAGE_SIZE, include: LIST_INCLUDE });
    res.set({
      "X-Total": String(result.total),
      "X-Page": String(result.page),
      "X-Total-Pages": String(result.totalPages),
    });
    res.render("dishes/_cards", { dishes: result.dishes });
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
