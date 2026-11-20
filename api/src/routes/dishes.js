// Món ăn. Hai router dùng chung handler ghi:
//   /api/dishes        (publicRouter)  GET công khai, chỉ món đã đăng; ghi cần Bearer (app.js)
//   /api/admin/dishes  (adminRouter)   cần Bearer: GET thấy cả món nháp, kèm cờ canEdit / canDelete
//                                      để SPA biết hiện nút nào; ghi như /api/dishes
//
// Block 10: app.js cho Editor và Admin tới các handler ghi và router quản trị (requireDishStaff:
// viewer -> 403, RBAC theo method). Handler giữ cùng quy tắc với bản SSR (src/routes/admin/dishes.js):
//   POST    Admin chọn đầu bếp và trạng thái (mặc định published). Editor: chefId của tài khoản,
//           status draft, chefId / status trong body bị bỏ qua; chưa gắn đầu bếp -> 403.
//   PATCH   ABAC: Editor chỉ sửa món draft của đầu bếp mình; điều kiện nằm trong WHERE của câu UPDATE
//           (cùng transaction với thay công thức). Admin: không thêm điều kiện.
//   DELETE  chỉ Admin.
// Cờ canEdit / canDelete chỉ phục vụ giao diện; server vẫn kiểm tra ở từng request ghi.
const express = require("express");
const prisma = require("../db/prisma");
const { buildDishWhere, isRanked, countRanked, rankedIds, orderByIds } = require("../db/dish-search");
const { ok, notFound, validationFailed, forbidden } = require("../http/respond");
const { asyncHandler, parseId, paginate, pageParams, isEmpty, isNotFoundError } = require("../utils/helpers");
const { validateDish, DISH_SORTS, DISH_STATUSES, parseDishSort, parseDishSearch } = require("../utils/validators");
const { canAssignDish, canCreateDish, dishEditScope, canEditDish, canDeleteDish } = require("../auth/policy");

// Số món mỗi trang mặc định (lưới 3 cột -> 3 hàng)
const DEFAULT_PAGE_SIZE = 9;

// Chi tiết món: đầu bếp + công thức sắp theo tên nguyên liệu
const DETAIL_INCLUDE = {
  chef: true,
  ingredients: {
    include: { ingredient: true },
    orderBy: { ingredient: { name: "asc" } },
  },
};

// Danh sách món: đầu bếp + số nguyên liệu trong công thức
const LIST_INCLUDE = { chef: true, _count: { select: { ingredients: true } } };

// Block 9 Bài 2: GET công khai chỉ trả món đã đăng (status không đọc từ query string)
const PUBLISHED = { status: "published" };

const CANNOT_CREATE = "Tài khoản chưa được gắn với đầu bếp nào nên không tạo được món";
const CANNOT_EDIT = "Bạn chỉ sửa được món ở trạng thái nháp của đầu bếp mình phụ trách";

// Danh sách đầu bếp / nguyên liệu để validate chefId và công thức
async function loadRefs() {
  const [chefs, ingredients] = await Promise.all([
    prisma.chef.findMany({ select: { id: true } }),
    prisma.ingredient.findMany({ select: { id: true, name: true } }),
  ]);
  return { chefs, ingredients };
}

// Gắn cờ quyền của người gọi (chỉ ở router quản trị và response ghi)
const withFlags = (user, dish) => ({ ...dish, canEdit: canEditDish(user, dish), canDelete: canDeleteDish(user) });

/*
 * GET danh sách + tìm kiếm 4 mode + lọc + sắp xếp (tham số: xem parseDishSearch).
 * Không có ?page -> trả cả danh sách (không meta); có ?page -> phân trang + meta.
 * fixed: điều kiện server tự thêm (trang công khai: status published). decorate: gắn cờ quyền.
 */
async function listDishes(req, res, { fixed, decorate = (d) => d }) {
  const parsed = parseDishSearch(req.query);
  if (!isEmpty(parsed.fields)) return validationFailed(res, parsed.fields);
  const search = { ...parsed.search, ...fixed };
  const paging = pageParams(req.query, DEFAULT_PAGE_SIZE);

  // fulltext/fuzzy có từ khóa: SQL xếp hạng chọn id (điểm giảm dần, id tăng dần), Prisma nạp
  // bản ghi kèm quan hệ rồi sắp lại theo id. ?sort bị bỏ qua vì thứ tự là độ liên quan.
  if (isRanked(search)) {
    const load = async (ids) =>
      orderByIds(await prisma.dish.findMany({ where: { id: { in: ids } }, include: LIST_INCLUDE }), ids).map(decorate);
    if (!paging) return ok(res, await load(await rankedIds(prisma, search, null)));

    const total = await countRanked(prisma, search);
    const { page, totalPages, skip, take } = paginate(total, paging.rawPage, paging.pageSize);
    const dishes = await load(await rankedIds(prisma, search, { skip, take }));
    return ok(res, dishes, { page, totalPages, total, pageSize: paging.pageSize, mode: search.mode });
  }

  const sort = parseDishSort(req.query.sort);
  const where = buildDishWhere(search);
  const query = { where, orderBy: DISH_SORTS[sort].orderBy, include: LIST_INCLUDE };

  if (!paging) {
    return ok(res, (await prisma.dish.findMany(query)).map(decorate));
  }

  const total = await prisma.dish.count({ where });
  const { page, totalPages, skip, take } = paginate(total, paging.rawPage, paging.pageSize);
  const dishes = (await prisma.dish.findMany({ ...query, skip, take })).map(decorate);
  ok(res, dishes, { page, totalPages, total, pageSize: paging.pageSize, mode: search.mode });
}

// ─────────────────────────────── handler ghi ───────────────────────────────

// POST — tạo món mới (kèm công thức)
const createDish = asyncHandler(async (req, res) => {
  if (!canCreateDish(req.user)) return forbidden(res, "FORBIDDEN", CANNOT_CREATE);
  const canAssign = canAssignDish(req.user);
  const { chefs, ingredients } = await loadRefs();
  const { fields, data, recipe } = validateDish(req.body, { chefs, ingredients, canAssign });
  if (!isEmpty(fields)) return validationFailed(res, fields);

  if (!canAssign) {
    // Editor: món thuộc đầu bếp của tài khoản (đọc từ DB) và luôn là nháp
    data.chefId = req.user.chefId;
    data.status = "draft";
  } else if (data.status === undefined) {
    // Admin không chọn: giữ hành vi Bài 1, món tạo từ SPA hiện ngay trên thực đơn
    data.status = "published";
  }
  const dish = await prisma.dish.create({
    data: { ...data, ingredients: { create: recipe } },
    include: DETAIL_INCLUDE,
  });
  ok(res, withFlags(req.user, dish));
});

// PATCH — sửa một phần; có `ingredients` thì thay toàn bộ công thức
const updateDish = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) return notFound(res, "Món ăn");

  const dish = await prisma.dish.findUnique({ where: { id } });
  if (!dish) return notFound(res, "Món ăn");
  // Kiểm tra sớm để không trả lỗi validate cho món không được sửa; điều kiện thật nằm ở UPDATE
  const scope = dishEditScope(req.user);
  if (!scope || !canEditDish(req.user, dish)) return forbidden(res, "FORBIDDEN", CANNOT_EDIT);

  const { chefs, ingredients } = await loadRefs();
  const { fields, data, recipe } = validateDish(req.body, {
    chefs,
    ingredients,
    partial: true,
    canAssign: canAssignDish(req.user),
  });
  if (!isEmpty(fields)) return validationFailed(res, fields);

  // Điều kiện ABAC (scope) nằm trong WHERE của câu UPDATE: món bị đổi status / chefId giữa lúc đọc
  // và lúc ghi thì không khớp dòng nào -> 403, công thức cũng không bị thay. Editor: data không có
  // chefId / status (validator bỏ qua), ghi thêm chính các giá trị của scope để câu UPDATE luôn có
  // cột để ghi kể cả khi body chỉ đổi công thức. Admin: scope rỗng, không có điều kiện ABAC.
  const writeData = { ...data, ...scope };
  const updated = await prisma.$transaction(async (tx) => {
    const matched = isEmpty(writeData)
      ? await tx.dish.count({ where: { id } })
      : (await tx.dish.updateMany({ where: { id, ...scope }, data: writeData })).count;
    if (matched !== 1) return false;
    if (recipe !== undefined) {
      await tx.dishIngredient.deleteMany({ where: { dishId: id } });
      if (recipe.length) await tx.dishIngredient.createMany({ data: recipe.map((row) => ({ ...row, dishId: id })) });
    }
    return true;
  });
  if (!updated) {
    const still = await prisma.dish.findUnique({ where: { id }, select: { id: true } });
    return still ? forbidden(res, "FORBIDDEN", CANNOT_EDIT) : notFound(res, "Món ăn");
  }
  const fresh = await prisma.dish.findUnique({ where: { id }, include: DETAIL_INCLUDE });
  ok(res, withFlags(req.user, fresh));
});

// DELETE — xóa món (công thức xóa theo nhờ onDelete: Cascade). RBAC delete đã kiểm tra ở app.js.
const deleteDish = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) return notFound(res, "Món ăn");

  try {
    await prisma.dish.delete({ where: { id } });
    ok(res, null);
  } catch (err) {
    if (isNotFoundError(err)) return notFound(res, "Món ăn");
    throw err;
  }
});

function mountWrites(router) {
  router.post("/", createDish);
  router.patch("/:id", updateDish);
  router.delete("/:id", deleteDish);
}

// ─────────────────────────────── /api/dishes ───────────────────────────────

const publicRouter = express.Router();

// GET /api/dishes?mode&q&category&minPrice&maxPrice&available&ingredient&sort&page&pageSize
publicRouter.get(
  "/",
  asyncHandler((req, res) => listDishes(req, res, { fixed: PUBLISHED }))
);

// GET /api/dishes/:id — chi tiết món đã đăng
publicRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return notFound(res, "Món ăn");

    const dish = await prisma.dish.findFirst({ where: { id, ...PUBLISHED }, include: DETAIL_INCLUDE });
    if (!dish) return notFound(res, "Món ăn");
    ok(res, dish);
  })
);

mountWrites(publicRouter);

// ─────────────────────────────── /api/admin/dishes ───────────────────────────────

const adminRouter = express.Router();

// GET /api/admin/dishes?...&status=draft|published — như danh sách công khai nhưng thấy cả món nháp;
// status lạ bị bỏ qua (xem tất cả)
adminRouter.get(
  "/",
  asyncHandler((req, res) => {
    const status = DISH_STATUSES.includes(req.query.status) ? req.query.status : undefined;
    return listDishes(req, res, { fixed: status ? { status } : {}, decorate: (d) => withFlags(req.user, d) });
  })
);

// GET /api/admin/dishes/:id — chi tiết, kể cả món nháp
adminRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return notFound(res, "Món ăn");

    const dish = await prisma.dish.findUnique({ where: { id }, include: DETAIL_INCLUDE });
    if (!dish) return notFound(res, "Món ăn");
    ok(res, withFlags(req.user, dish));
  })
);

mountWrites(adminRouter);

module.exports = { publicRouter, adminRouter };
