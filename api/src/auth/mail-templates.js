// Nội dung email. OTP và link chỉ xuất hiện ở đây (trong thư), không có trong response hay log.
const RESTAURANT = { name: "Lửa Hồng" };

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function layout(title, bodyHtml) {
  return `<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;background:#FFF8F2;font-family:system-ui,sans-serif;color:#2B1B17">
  <div style="max-width:520px;margin:24px auto;background:#fff;border:1px solid #EADBD2;border-radius:16px;padding:28px">
    <p style="margin:0 0 16px;font-weight:800;font-size:20px;color:#B8321C">${escapeHtml(RESTAURANT.name)}</p>
    ${bodyHtml}
    <p style="margin:24px 0 0;font-size:12px;color:#78716c">Nếu bạn không thực hiện yêu cầu này, hãy bỏ qua email.</p>
  </div>
</body></html>`;
}

function activationEmail(otp, minutes) {
  const subject = `Mã kích hoạt tài khoản ${RESTAURANT.name}`;
  const text = `Mã kích hoạt của bạn: ${otp}\nMã có hiệu lực trong ${minutes} phút và chỉ dùng được một lần.`;
  const html = layout(
    subject,
    `<p>Mã kích hoạt tài khoản của bạn:</p>
     <p style="font-size:32px;font-weight:800;letter-spacing:8px;margin:12px 0">${escapeHtml(otp)}</p>
     <p>Mã có hiệu lực trong ${minutes} phút và chỉ dùng được một lần. Nhập mã tại trang kích hoạt.</p>`
  );
  return { subject, text, html };
}

function resetEmail(link, minutes) {
  const subject = `Đặt lại mật khẩu ${RESTAURANT.name}`;
  const text = `Mở link sau để đặt mật khẩu mới (hiệu lực ${minutes} phút, dùng một lần):\n${link}`;
  const html = layout(
    subject,
    `<p>Có yêu cầu đặt lại mật khẩu cho tài khoản của bạn.</p>
     <p><a href="${escapeHtml(link)}" style="display:inline-block;background:#B8321C;color:#fff;padding:12px 20px;border-radius:12px;font-weight:700;text-decoration:none">Đặt mật khẩu mới</a></p>
     <p style="font-size:13px;color:#78716c">Link có hiệu lực trong ${minutes} phút và chỉ dùng được một lần.</p>`
  );
  return { subject, text, html };
}

function passwordChangedEmail() {
  const subject = `Mật khẩu ${RESTAURANT.name} đã được đổi`;
  const text = "Mật khẩu tài khoản của bạn vừa được đặt lại. Mọi phiên đăng nhập cũ (kể cả trên ứng dụng web) đã bị đăng xuất.";
  const html = layout(
    subject,
    `<p>Mật khẩu tài khoản của bạn vừa được đặt lại. Mọi phiên đăng nhập cũ (kể cả trên ứng dụng web) đã bị đăng xuất.</p>
     <p>Nếu không phải bạn, hãy dùng chức năng quên mật khẩu ngay để lấy lại tài khoản.</p>`
  );
  return { subject, text, html };
}

module.exports = { activationEmail, resetEmail, passwordChangedEmail };
