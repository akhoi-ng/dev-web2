// Nơi giữ access token của SPA. Không import gì của Vite/React để chạy được dưới Node thuần (test).
//
// Lựa chọn nơi lưu (README mục "Nơi lưu token"):
//  - Access token (JWT, 15 phút): chỉ nằm trong BIẾN JavaScript của module này. Không ghi vào
//    localStorage/sessionStorage, nên mã XSS không đọc được token cũ còn sót trong Storage, và token
//    mất khi đóng tab hoặc tải lại trang.
//  - Refresh token (7 ngày): cookie HttpOnly `rt` do API đặt, JavaScript không đọc được; browser chỉ
//    gửi nó cho /api/auth/*. Tải lại trang thì gọi POST /api/auth/refresh để lấy access token mới.
//  - Rủi ro còn lại: mã XSS chạy trong trang vẫn gọi được API (kể cả /refresh) trong lúc trang mở.
//    Cách giảm: React escape dữ liệu khi render, không dùng dangerouslySetInnerHTML với dữ liệu người dùng.
//  - localStorage chỉ giữ cờ "lua-hong:signed-in" = "1" (không phải bí mật) để trang biết có nên thử
//    refresh lúc tải hay không; sửa cờ này không cấp được quyền gì.

const HINT_KEY = "lua-hong:signed-in";
const LOCK_NAME = "lua-hong:refresh";
const CHANNEL = "lua-hong:auth";
// Làm mới trước khi hết hạn: 60 giây, hoặc 1/5 thời hạn nếu token sống ngắn
// (900 giây -> làm mới ở giây 840; 60 giây -> ở giây 48)
const earlyRefreshSec = (expiresIn) => Math.min(60, expiresIn / 5);
const RETRY_MS = 15 * 1000; // làm mới thất bại do lỗi kỹ thuật: thử lại sau 15 giây

function safeStorage(storage) {
  return {
    get(key) {
      try {
        return storage ? storage.getItem(key) : null;
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        if (storage) storage.setItem(key, value);
      } catch {
        // Storage bị chặn: chỉ mất gợi ý, không ảnh hưởng đăng nhập
      }
    },
    remove(key) {
      try {
        if (storage) storage.removeItem(key);
      } catch {
        // như trên
      }
    },
  };
}

/*
 * createSession({ baseUrl, fetchImpl, locks, storage, channel, setTimer, clearTimer })
 * Các tham số sau baseUrl chỉ để test thay thế; mặc định dùng của browser.
 */
export function createSession({
  baseUrl,
  fetchImpl = globalThis.fetch,
  locks = globalThis.navigator && globalThis.navigator.locks,
  storage = globalThis.localStorage,
  channel = typeof BroadcastChannel === "function" ? new BroadcastChannel(CHANNEL) : null,
  setTimer = globalThis.setTimeout,
  clearTimer = globalThis.clearTimeout,
} = {}) {
  const base = String(baseUrl || "").replace(/\/+$/, "");
  const hint = safeStorage(storage);
  const listeners = new Set();

  let accessToken = null;
  // Đã đăng nhập ở tab này. Tách khỏi accessToken: lúc token đang được làm mới hay vừa hết hạn,
  // người dùng vẫn đang đăng nhập; chỉ khi refresh token hết hiệu lực mới kết thúc phiên.
  let signedIn = false;
  let timer = null;
  let inflight = null;

  function emit(event) {
    for (const fn of listeners) fn(event);
  }

  function stopTimer() {
    if (timer) clearTimer(timer);
    timer = null;
  }

  function schedule(expiresIn) {
    stopTimer();
    const sec = Number(expiresIn);
    timer = setTimer(onTimer, Math.max(5, sec - earlyRefreshSec(sec)) * 1000);
  }

  // Hẹn giờ tới: làm mới. Hết phiên ("invalid") do refresh() xử lý. Lỗi mạng, 429, 5xx là lỗi kỹ
  // thuật: giữ phiên, thử lại sau RETRY_MS (request gặp 401 trong lúc đó cũng tự thử refresh).
  function onTimer() {
    timer = null;
    refresh().then((ok) => {
      if (!ok && signedIn && !timer) timer = setTimer(onTimer, RETRY_MS);
    });
  }

  function set({ accessToken: token, expiresIn }) {
    accessToken = token;
    signedIn = true;
    hint.set(HINT_KEY, "1");
    schedule(expiresIn);
    emit("token");
  }

  function clearLocal() {
    accessToken = null;
    signedIn = false;
    stopTimer();
    hint.remove(HINT_KEY);
  }

  // Kết thúc phiên ở tab này; chỉ báo giao diện nếu tab đang đăng nhập
  function end(event) {
    const was = signedIn;
    clearLocal();
    if (was) emit(event);
  }

  // Phiên không còn dùng được (API vẫn 401 với token vừa làm mới): xóa token, giao diện về /login
  function expire() {
    end("expired");
  }

  async function callRefresh() {
    let res;
    try {
      res = await fetchImpl(base + "/api/auth/refresh", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
    } catch {
      return "network";
    }
    let payload = null;
    try {
      payload = await res.json();
    } catch {
      payload = null;
    }
    if (res.ok && payload && payload.ok && payload.data && payload.data.accessToken) {
      set(payload.data);
      return "ok";
    }
    // 401: refresh token không còn hiệu lực. 429/5xx: lỗi kỹ thuật, không coi là đã đăng xuất
    return res.status === 401 ? "invalid" : "error";
  }

  /*
   * Làm mới access token -> true | false. Một lần gọi tại một thời điểm trong tab (các request cùng
   * gặp 401 chờ chung một Promise) và giữa các tab (Web Locks): refresh token xoay vòng, nếu hai tab
   * gửi cùng một cookie cũ thì API coi là dùng lại và thu hồi cả phiên.
   *  - "invalid" (API trả 401): kết thúc phiên, phát "expired" nếu tab đang đăng nhập
   *  - lỗi mạng, 429, 5xx: trả false nhưng GIỮ phiên và token hiện có
   */
  function refresh() {
    if (!inflight) {
      const run = () => callRefresh();
      const job = locks && typeof locks.request === "function" ? locks.request(LOCK_NAME, run) : run();
      inflight = job
        .then((result) => {
          if (result === "invalid") end("expired");
          return result === "ok";
        })
        .finally(() => {
          inflight = null;
        });
    }
    return inflight;
  }

  // Lúc tải trang: chỉ thử refresh nếu trước đó đã đăng nhập ở browser này
  async function restore() {
    if (!hint.get(HINT_KEY)) return false;
    return refresh();
  }

  async function logout() {
    clearLocal();
    try {
      await fetchImpl(base + "/api/auth/logout", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
    } catch {
      // Mất mạng: token ở client đã bị xóa; cookie rt hết hạn theo lịch
    }
    if (channel) channel.postMessage("logout");
    emit("logout");
  }

  function announceLogin() {
    if (channel) channel.postMessage("login");
  }

  // Tab khác đăng xuất: tab này bỏ token ngay. Tab khác đăng nhập: tab này lấy token qua refresh.
  if (channel) {
    channel.onmessage = (e) => {
      if (e.data === "logout") {
        clearLocal();
        emit("logout");
      } else if (e.data === "login" && !accessToken) {
        refresh().then((ok) => ok && emit("login"));
      }
    };
  }

  return {
    getToken: () => accessToken,
    set,
    refresh,
    restore,
    expire,
    logout,
    announceLogin,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
