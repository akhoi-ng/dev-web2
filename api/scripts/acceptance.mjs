// Kiểm thử chấp nhận: gọi API đang chạy (npm run dev) và đối chiếu bảng REST.
// Chạy: npm run acceptance   (API_URL, ORIGIN có thể ghi đè bằng biến môi trường)
const API = process.env.API_URL || "http://localhost:3000";
const ORIGIN = process.env.ORIGIN || "http://localhost:5173";

let failed = 0;

/*
 * check(name, { method, path, body, headers }, expect)
 * expect: status, ok (true/false), noOk (không có trường ok), code, fieldsHas (mảng khóa),
 *         dataIsArray, dataNull, header { tên: giá trị }, test (json, res) => true | thông báo lỗi
 * Trả về { res, json } để dòng sau dùng tiếp (ví dụ lấy id vừa tạo).
 */
async function check(name, req, expect = {}) {
  const { method = "GET", path, body, headers = {} } = req;
  const problems = [];
  let res;
  let json;
  try {
    res = await fetch(API + path, {
      method,
      headers: {
        Origin: ORIGIN,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      json = undefined;
    }

    const status = expect.status ?? 200;
    if (res.status !== status) problems.push(`status ${res.status}, cần ${status}`);
    if (expect.ok !== undefined && json?.ok !== expect.ok) problems.push(`ok = ${json?.ok}, cần ${expect.ok}`);
    if (expect.noOk && json && "ok" in json) problems.push("không được có trường ok");
    if (expect.code && json?.error?.code !== expect.code) problems.push(`code = ${json?.error?.code}, cần ${expect.code}`);
    for (const key of expect.fieldsHas || []) {
      if (!json?.error?.fields || !(key in json.error.fields)) problems.push(`thiếu fields.${key}`);
    }
    if (expect.dataIsArray && !Array.isArray(json?.data)) problems.push("data không phải mảng");
    if (expect.dataNull && json?.data !== null) problems.push("data phải là null");
    for (const [h, v] of Object.entries(expect.header || {})) {
      const actual = res.headers.get(h);
      if (actual !== v) problems.push(`header ${h} = ${actual}, cần ${v}`);
    }
    if (expect.test) {
      const result = expect.test(json, res);
      if (result !== true) problems.push(result || "test thất bại");
    }
  } catch (err) {
    problems.push("lỗi gọi API: " + err.message);
  }

  if (problems.length) {
    failed++;
    console.log(`FAIL ${name} — ${problems.join("; ")}`);
  } else {
    console.log(`PASS ${name}`);
  }
  return { res, json };
}

/* ---------------- Tiện ích dùng chung cho các nhóm dòng ---------------- */

// Dòng phụ thuộc id của bản ghi vừa tạo: nếu POST tạo thất bại (không có id) thì dòng FAIL,
// không gọi /api/.../undefined.
async function checkWithId(name, id, makeReq, expect) {
  if (typeof id !== "number") {
    failed++;
    console.log(`FAIL ${name} — no id (create failed)`);
    return {};
  }
  return check(name, makeReq(id), expect);
}

// Dọn dẹp bản ghi do script tạo: xóa bằng API; ok:true hoặc NOT_FOUND (đã xóa) là bình thường,
// còn lại (hoặc lỗi mạng) in cảnh báo nêu rõ bản ghi bị sót.
async function cleanup(resource, ids) {
  for (const id of ids) {
    let clean = false;
    try {
      const res = await fetch(`${API}/api/${resource}/${id}`, { method: "DELETE", headers: { Origin: ORIGIN } });
      const json = await res.json().catch(() => undefined);
      clean = json?.ok === true || json?.error?.code === "NOT_FOUND";
    } catch {
      clean = false;
    }
    if (!clean) console.log(`WARN leftover ${resource} id=${id}`);
  }
}

// Lấy id số từ phản hồi POST và ghi vào danh sách cần dọn; undefined nếu tạo thất bại
function createdId(created, ids) {
  const id = created.json?.data?.id;
  if (typeof id !== "number") return undefined;
  ids.push(id);
  return id;
}

/* ---------------- Món ăn, thống kê, tùy chọn ---------------- */
async function dishesRows() {
  // Mọi món tạo ra đều được xóa ở finally, kể cả khi một dòng thất bại
  const createdIds = [];
  try {
    await check("dishes: list", { path: "/api/dishes" }, {
      ok: true,
      dataIsArray: true,
      header: { "access-control-allow-origin": ORIGIN },
    });
    await check("dishes: list ?page=abc -> meta.page 1", { path: "/api/dishes?page=abc" }, {
      ok: true,
      dataIsArray: true,
      test: (j) => j.meta?.page === 1 || `meta.page = ${j.meta?.page}`,
    });
    await check("dishes: list q[] và category lạ", { path: "/api/dishes?q[]=x&category=xyz" }, {
      ok: true,
      dataIsArray: true,
    });

    // % và _ người dùng gõ là ký tự thường, không được mở rộng phạm vi thành "mọi món"
    const all = await check("dishes: tổng số món", { path: "/api/dishes?page=1" }, { ok: true });
    const allTotal = all.json?.meta?.total;
    for (const [label, encoded] of [["%", "%25"], ["_", "%5F"]]) {
      await check(`dishes: q=${label} là ký tự thường`, { path: `/api/dishes?q=${encoded}&page=1` }, {
        ok: true,
        test: (j) => j.meta?.total < allTotal || `total = ${j.meta?.total}, bằng toàn bộ ${allTotal} món`,
      });
    }

    await check("dishes: POST thiếu name, price âm", { method: "POST", path: "/api/dishes", body: { name: "", price: -5 } }, {
      ok: false,
      code: "VALIDATION_FAILED",
      fieldsHas: ["name", "price"],
    });
    await check("dishes: POST price là chuỗi", { method: "POST", path: "/api/dishes", body: { name: "Test", price: "50000" } }, {
      ok: false,
      code: "VALIDATION_FAILED",
      fieldsHas: ["price"],
    });

    const created = await check("dishes: POST hợp lệ", {
      method: "POST",
      path: "/api/dishes",
      body: { name: "Món kiểm thử acceptance", price: 50000 },
    }, {
      ok: true,
      test: (j) => typeof j.data?.id === "number" || "data.id không phải số",
    });
    const id = createdId(created, createdIds);

    await checkWithId("dishes: detail", id, (i) => ({ path: `/api/dishes/${i}` }), {
      ok: true,
      test: (j) => Array.isArray(j.data?.ingredients) || "thiếu data.ingredients",
    });
    await check("dishes: detail 999999", { path: "/api/dishes/999999" }, { ok: false, code: "NOT_FOUND" });
    await check("dishes: detail abc", { path: "/api/dishes/abc" }, { ok: false, code: "NOT_FOUND" });

    await checkWithId("dishes: PATCH price", id, (i) => ({ method: "PATCH", path: `/api/dishes/${i}`, body: { price: 60000 } }), {
      ok: true,
      test: (j) => j.data?.price === 60000 || `price = ${j.data?.price}`,
    });
    await check("dishes: PATCH 999999", { method: "PATCH", path: "/api/dishes/999999", body: { price: 1 } }, {
      ok: false,
      code: "NOT_FOUND",
    });
    await checkWithId("dishes: PATCH name rỗng", id, (i) => ({ method: "PATCH", path: `/api/dishes/${i}`, body: { name: "" } }), {
      ok: false,
      code: "VALIDATION_FAILED",
      fieldsHas: ["name"],
    });

    await checkWithId("dishes: DELETE", id, (i) => ({ method: "DELETE", path: `/api/dishes/${i}` }), { ok: true, dataNull: true });
    await checkWithId("dishes: DELETE lần 2", id, (i) => ({ method: "DELETE", path: `/api/dishes/${i}` }), { ok: false, code: "NOT_FOUND" });
  } finally {
    await cleanup("dishes", createdIds);
  }

  await check("route lạ /api/bok -> 404", { path: "/api/bok" }, { status: 404, noOk: true });
  await check("stats", { path: "/api/stats" }, {
    ok: true,
    test: (j) => (Array.isArray(j.data?.tiles) && typeof j.data?.dishes === "number") || "thiếu tiles/dishes",
  });
  await check("options", { path: "/api/options" }, {
    ok: true,
    test: (j) => (Array.isArray(j.data?.categories) && !!j.data?.booking?.minDate) || "thiếu categories/booking.minDate",
  });
  await check("CORS preflight PATCH", {
    method: "OPTIONS",
    path: "/api/dishes/1",
    headers: { "Access-Control-Request-Method": "PATCH", "Access-Control-Request-Headers": "content-type" },
  }, {
    status: 204,
    header: { "access-control-allow-origin": ORIGIN },
  });
}

/* ---------------- Đầu bếp và nguyên liệu: cùng một bộ năm thao tác ---------------- */
// cfg: resource, invalidBody/invalidFields (POST sai), validBody, patchBody + patchTest,
//      patchInvalidBody/patchInvalidField (PATCH sai)
async function crudRows(cfg) {
  const { resource } = cfg;
  const base = `/api/${resource}`;
  const createdIds = [];
  try {
    await check(`${resource}: list`, { path: base }, {
      ok: true,
      dataIsArray: true,
      test: (j) =>
        j.data?.every?.((item) => typeof item._count?.dishes === "number") || "thiếu _count.dishes ở một mục",
    });
    await check(`${resource}: list ?page=1&pageSize=2 -> meta`, { path: `${base}?page=1&pageSize=2` }, {
      ok: true,
      dataIsArray: true,
      test: (j) =>
        (j.meta?.page === 1 && j.meta?.pageSize === 2 && j.data?.length <= 2) ||
        `meta = ${JSON.stringify(j.meta)}, ${j.data?.length} mục`,
    });
    await check(`${resource}: list ?page=abc -> meta.page 1`, { path: `${base}?page=abc` }, {
      ok: true,
      dataIsArray: true,
      test: (j) => j.meta?.page === 1 || `meta.page = ${j.meta?.page}`,
    });

    await check(`${resource}: POST sai`, { method: "POST", path: base, body: cfg.invalidBody }, {
      ok: false,
      code: "VALIDATION_FAILED",
      fieldsHas: cfg.invalidFields,
    });

    const created = await check(`${resource}: POST hợp lệ`, { method: "POST", path: base, body: cfg.validBody }, {
      ok: true,
      test: (j) => typeof j.data?.id === "number" || "data.id không phải số",
    });
    const id = createdId(created, createdIds);

    await checkWithId(`${resource}: detail`, id, (i) => ({ path: `${base}/${i}` }), {
      ok: true,
      test: (j) => Array.isArray(j.data?.dishes) || "thiếu data.dishes",
    });
    await check(`${resource}: detail 999999`, { path: `${base}/999999` }, { ok: false, code: "NOT_FOUND" });
    await check(`${resource}: detail abc`, { path: `${base}/abc` }, { ok: false, code: "NOT_FOUND" });

    await checkWithId(`${resource}: PATCH`, id, (i) => ({ method: "PATCH", path: `${base}/${i}`, body: cfg.patchBody }), {
      ok: true,
      test: cfg.patchTest,
    });
    await check(`${resource}: PATCH 999999`, { method: "PATCH", path: `${base}/999999`, body: cfg.patchBody }, {
      ok: false,
      code: "NOT_FOUND",
    });
    await checkWithId(`${resource}: PATCH sai`, id, (i) => ({ method: "PATCH", path: `${base}/${i}`, body: cfg.patchInvalidBody }), {
      ok: false,
      code: "VALIDATION_FAILED",
      fieldsHas: [cfg.patchInvalidField],
    });

    await checkWithId(`${resource}: DELETE`, id, (i) => ({ method: "DELETE", path: `${base}/${i}` }), { ok: true, dataNull: true });
    await checkWithId(`${resource}: DELETE lần 2`, id, (i) => ({ method: "DELETE", path: `${base}/${i}` }), { ok: false, code: "NOT_FOUND" });
  } finally {
    await cleanup(resource, createdIds);
  }
}

async function chefsRows() {
  await crudRows({
    resource: "chefs",
    invalidBody: { name: "", specialty: "" },
    invalidFields: ["name", "specialty"],
    validBody: { name: "Đầu bếp kiểm thử acceptance", specialty: "Món thử" },
    patchBody: { specialty: "Món thử đã sửa" },
    patchTest: (j) => j.data?.specialty === "Món thử đã sửa" || `specialty = ${j.data?.specialty}`,
    patchInvalidBody: { name: "" },
    patchInvalidField: "name",
  });

  // Xóa đầu bếp thì món còn lại với chef = null (onDelete: SetNull)
  const chefIds = [];
  const dishIds = [];
  try {
    const chef = await check("chefs: tạo đầu bếp để thử xóa", {
      method: "POST",
      path: "/api/chefs",
      body: { name: "Đầu bếp xóa thử acceptance", specialty: "Món thử" },
    }, {
      ok: true,
      test: (j) => typeof j.data?.id === "number" || "data.id không phải số",
    });
    const chefId = createdId(chef, chefIds);

    const dish = await checkWithId("chefs: tạo món có chefId", chefId, (c) => ({
      method: "POST",
      path: "/api/dishes",
      body: { name: "Món thử xóa đầu bếp acceptance", price: 50000, chefId: c },
    }), {
      ok: true,
      test: (j) => typeof j.data?.id === "number" || "data.id không phải số",
    });
    const dishId = createdId(dish, dishIds);

    await checkWithId("chefs: DELETE đầu bếp có món", chefId, (c) => ({ method: "DELETE", path: `/api/chefs/${c}` }), {
      ok: true,
      dataNull: true,
    });
    await checkWithId("chefs: món còn lại với chef = null", dishId, (d) => ({ path: `/api/dishes/${d}` }), {
      ok: true,
      test: (j) => j.data?.chef === null || `chef = ${JSON.stringify(j.data?.chef)}`,
    });
  } finally {
    await cleanup("dishes", dishIds);
    await cleanup("chefs", chefIds);
  }
}

async function ingredientsRows() {
  await crudRows({
    resource: "ingredients",
    invalidBody: { name: "", unit: "" },
    invalidFields: ["name", "unit"],
    validBody: { name: "Nguyên liệu kiểm thử acceptance", unit: "g" },
    patchBody: { unit: "kg" },
    patchTest: (j) => j.data?.unit === "kg" || `unit = ${j.data?.unit}`,
    patchInvalidBody: { unit: "" },
    patchInvalidField: "unit",
  });
}

/* ---------------- Đặt bàn ---------------- */
// API không có DELETE đặt bàn nên các yêu cầu thử còn lại trong DB (tên "ZZ Acceptance");
// chạy lại seed là xóa sạch (seed reset bookings).
async function bookingsRows() {
  // Ngày mai theo giờ Việt Nam: luôn hợp lệ với khung giờ 18:00
  const tomorrow = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(
    new Date(Date.now() + 24 * 60 * 60 * 1000)
  );

  await check("bookings: POST sai", { method: "POST", path: "/api/bookings", body: {} }, {
    ok: false,
    code: "VALIDATION_FAILED",
    fieldsHas: ["name", "phone"],
  });

  const created = await check("bookings: POST hợp lệ", {
    method: "POST",
    path: "/api/bookings",
    body: { name: "ZZ Acceptance", phone: "0123456789", guests: 2, date: tomorrow, time: "18:00", note: "seed resets bookings" },
  }, {
    ok: true,
    test: (j) => /^[0-9a-f]{8}$/.test(j.data?.code ?? "") || `code = ${j.data?.code}`,
  });
  const id = created.json?.data?.id;
  const code = created.json?.data?.code;

  // Gắn với id để dòng FAIL gọn nếu POST tạo thất bại (id và code cùng đến từ một phản hồi)
  await checkWithId("bookings: GET theo mã", id, () => ({ path: `/api/bookings/${code}` }), {
    ok: true,
    test: (j) => j.data?.id === id || `id = ${j.data?.id}`,
  });
  await check("bookings: GET zzz", { path: "/api/bookings/zzz" }, { ok: false, code: "NOT_FOUND" });
  await check("bookings: GET mã hợp lệ nhưng không có", { path: "/api/bookings/00000000" }, { ok: false, code: "NOT_FOUND" });

  await checkWithId("admin bookings: list (từ hôm nay)", id, () => ({ path: "/api/admin/bookings" }), {
    ok: true,
    dataIsArray: true,
    test: (j) => j.data.some((b) => b.id === id) || "thiếu yêu cầu vừa tạo",
  });
  await checkWithId("admin bookings: list ?show=all", id, () => ({ path: "/api/admin/bookings?show=all" }), {
    ok: true,
    dataIsArray: true,
    test: (j) => j.data.some((b) => b.id === id) || "thiếu yêu cầu vừa tạo",
  });

  await checkWithId("admin bookings: PATCH confirmed", id, (i) => ({
    method: "PATCH",
    path: `/api/admin/bookings/${i}`,
    body: { status: "confirmed" },
  }), {
    ok: true,
    test: (j) => j.data?.status === "confirmed" || `status = ${j.data?.status}`,
  });
  await checkWithId("admin bookings: PATCH status sai", id, (i) => ({
    method: "PATCH",
    path: `/api/admin/bookings/${i}`,
    body: { status: "x" },
  }), {
    ok: false,
    code: "VALIDATION_FAILED",
    fieldsHas: ["status"],
  });
  await check("admin bookings: PATCH 999999", {
    method: "PATCH",
    path: "/api/admin/bookings/999999",
    body: { status: "confirmed" },
  }, { ok: false, code: "NOT_FOUND" });
}

await dishesRows();
await chefsRows();
await ingredientsRows();
await bookingsRows();

if (failed > 0) {
  console.log(`\n${failed} dòng thất bại`);
  process.exit(1);
}
console.log("\nTất cả dòng đều PASS");
