// CAPTCHA bằng Google reCAPTCHA v2 (checkbox "Tôi không phải người máy").
//  - Browser: widget dùng site key (công khai), gửi kèm form trường g-recaptcha-response (token).
//  - Backend: gửi token + secret key tới siteverify của Google, chỉ cho qua khi success = true và
//    hostname là của ứng dụng. Google giữ trạng thái thử thách: token có hạn 2 phút, chỉ xác minh
//    được một lần (lần sau Google trả timeout-or-duplicate).
//  - Không tin bất kỳ cờ "captchaPassed" nào do browser tự gửi.
//  - Không gọi được Google (mạng, dịch vụ lỗi): KHÔNG cho qua, ném CaptchaUnavailableError.
const { recaptchaConfig } = require("./config");

class CaptchaUnavailableError extends Error {
  constructor(cause) {
    super("Không xác minh được reCAPTCHA");
    this.name = "CaptchaUnavailableError";
    this.cause = cause;
  }
}

const TIMEOUT_MS = 5000;

/*
 * token: req.body["g-recaptcha-response"]; remoteIp: req.ip (tùy chọn, Google dùng làm tín hiệu)
 * -> { ok: true } | { ok: false, reason } ; ném CaptchaUnavailableError khi không xác minh được
 */
async function verifyCaptcha(token, remoteIp) {
  if (typeof token !== "string" || !token.trim()) return { ok: false, reason: "missing-input-response" };

  const { secretKey, verifyUrl, hostnames } = recaptchaConfig();
  const body = new URLSearchParams({ secret: secretKey, response: token.trim() });
  if (remoteIp) body.set("remoteip", remoteIp);

  let result;
  try {
    const res = await fetch(verifyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error("siteverify HTTP " + res.status);
    result = await res.json();
  } catch (err) {
    throw new CaptchaUnavailableError(err);
  }

  // Secret sai / thiếu là lỗi cấu hình phía server, không phải người dùng giải sai
  const codes = Array.isArray(result["error-codes"]) ? result["error-codes"] : [];
  if (codes.some((c) => c === "invalid-input-secret" || c === "missing-input-secret")) {
    throw new CaptchaUnavailableError(new Error(codes.join(",")));
  }
  if (result.success !== true) return { ok: false, reason: codes.join(",") || "not-success" };
  if (!hostnames.includes(result.hostname)) return { ok: false, reason: "hostname-mismatch" };
  return { ok: true };
}

module.exports = { verifyCaptcha, CaptchaUnavailableError };
