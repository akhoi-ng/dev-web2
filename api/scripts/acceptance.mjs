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
    const id = created.json?.data?.id;
    if (typeof id === "number") createdIds.push(id);

    await check("dishes: detail", { path: `/api/dishes/${id}` }, {
      ok: true,
      test: (j) => Array.isArray(j.data?.ingredients) || "thiếu data.ingredients",
    });
    await check("dishes: detail 999999", { path: "/api/dishes/999999" }, { ok: false, code: "NOT_FOUND" });
    await check("dishes: detail abc", { path: "/api/dishes/abc" }, { ok: false, code: "NOT_FOUND" });

    await check("dishes: PATCH price", { method: "PATCH", path: `/api/dishes/${id}`, body: { price: 60000 } }, {
      ok: true,
      test: (j) => j.data?.price === 60000 || `price = ${j.data?.price}`,
    });
    await check("dishes: PATCH 999999", { method: "PATCH", path: "/api/dishes/999999", body: { price: 1 } }, {
      ok: false,
      code: "NOT_FOUND",
    });
    await check("dishes: PATCH name rỗng", { method: "PATCH", path: `/api/dishes/${id}`, body: { name: "" } }, {
      ok: false,
      code: "VALIDATION_FAILED",
      fieldsHas: ["name"],
    });

    await check("dishes: DELETE", { method: "DELETE", path: `/api/dishes/${id}` }, { ok: true, dataNull: true });
    await check("dishes: DELETE lần 2", { method: "DELETE", path: `/api/dishes/${id}` }, { ok: false, code: "NOT_FOUND" });
  } finally {
    // Dọn dẹp: xóa lại bằng API, bỏ qua nếu đã xóa
    for (const id of createdIds) {
      await fetch(`${API}/api/dishes/${id}`, { method: "DELETE", headers: { Origin: ORIGIN } }).catch(() => {});
    }
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

await dishesRows();

if (failed > 0) {
  console.log(`\n${failed} dòng thất bại`);
  process.exit(1);
}
console.log("\nTất cả dòng đều PASS");
