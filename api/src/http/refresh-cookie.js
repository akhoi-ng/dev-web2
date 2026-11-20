// Cookie refresh token (rt) và việc cấp cặp token. Dùng chung cho đăng nhập (routes/auth.js) và
// các bước MFA (routes/mfa.js): mọi chỗ cấp token đều đi qua issueTokens.
const { POLICY, cookieSecure, refreshSameSite } = require("../auth/config");
const tokens = require("../auth/tokens");

const RT = POLICY.refreshToken;

function refreshCookieOptions(expires) {
  return {
    httpOnly: true, // JavaScript của trang (kể cả mã XSS) không đọc được
    secure: cookieSecure() || refreshSameSite() === "none",
    sameSite: refreshSameSite(),
    path: RT.path, // chỉ gửi cho /api/auth/*, không đi kèm request CRUD
    ...(expires ? { expires } : {}),
  };
}

function setRefreshCookie(res, token, expiresAt) {
  res.cookie(RT.cookie, token, refreshCookieOptions(expiresAt));
}

function clearRefreshCookie(res) {
  res.clearCookie(RT.cookie, refreshCookieOptions());
}

// Cấp cặp token cho user đã qua đủ điều kiện (password đúng + active + MFA nếu đã bật).
// user phải là bản ghi mới đọc từ DB: access token mang tokenVersion hiện tại.
async function issueTokens(res, user) {
  const refresh = await tokens.issueRefreshToken(user.id);
  setRefreshCookie(res, refresh.token, refresh.expiresAt);
  return tokens.signAccessToken(user);
}

module.exports = { refreshCookieOptions, setRefreshCookie, clearRefreshCookie, issueTokens };
