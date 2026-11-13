// Gửi email OTP, link đặt lại mật khẩu, thông báo đổi mật khẩu.
// Chọn cách gửi bằng MAIL_TRANSPORT trong .env:
//   file     (mặc định) ghi thư vào thư mục mail-outbox/ (.eml + .html), không cần mạng hay tài khoản
//   resend   gửi thư thật qua Resend API (RESEND_API_KEY chỉ nằm ở backend, trong .env)
//   ethereal tự tạo hộp thư thử nghiệm miễn phí trên ethereal.email (cần Internet, không cần đăng ký)
//   smtp     SMTP bất kỳ: Mailpit/MailHog chạy local, Gmail App Password, Mailtrap... (SMTP_* trong .env)
// Log chỉ ghi người nhận đã che và loại thư; không bao giờ ghi OTP, token hay nội dung thư.
const fs = require("fs/promises");
const path = require("path");
const nodemailer = require("nodemailer");

// api/mail-outbox (đã có trong .gitignore)
const OUTBOX = path.join(__dirname, "..", "..", "mail-outbox");
const MODES = ["file", "resend", "ethereal", "smtp"];

let transportPromise = null;

function mode() {
  return (process.env.MAIL_TRANSPORT || "file").toLowerCase();
}

// Người gửi mặc định. Resend chưa xác minh domain thì chỉ gửi được từ onboarding@resend.dev.
function fromAddress() {
  if (process.env.MAIL_FROM) return process.env.MAIL_FROM;
  return mode() === "resend" ? "Lửa Hồng <onboarding@resend.dev>" : "Lửa Hồng <no-reply@luahong.local>";
}

// Kiểm tra cấu hình lúc khởi động server; ném lỗi nếu thiếu
function checkMailConfig() {
  const m = mode();
  if (!MODES.includes(m)) throw new Error(`MAIL_TRANSPORT không hợp lệ: ${m} (chọn ${MODES.join(" | ")})`);
  if (m === "resend" && !/^re_\w+/.test(process.env.RESEND_API_KEY || "")) {
    throw new Error("MAIL_TRANSPORT=resend nhưng thiếu RESEND_API_KEY (dạng re_...) trong .env");
  }
  if (m === "smtp" && !process.env.SMTP_HOST) throw new Error("MAIL_TRANSPORT=smtp nhưng thiếu SMTP_HOST trong .env");
}

// Mỗi transport có cùng giao diện: send({ from, to, subject, text, html }) -> { id, raw? }
async function createTransport() {
  const m = mode();
  if (m === "resend") {
    const { Resend } = require("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);
    return {
      async send(message) {
        const { data, error } = await resend.emails.send(message);
        if (error) {
          // Ví dụ: chưa xác minh domain thì chỉ gửi được tới email của chủ tài khoản Resend
          throw Object.assign(new Error(error.message), { code: error.name || "resend_error" });
        }
        return { id: data && data.id };
      },
    };
  }

  let mailer;
  if (m === "smtp") {
    mailer = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === "1",
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
  } else if (m === "ethereal") {
    // Hộp thư tạm do Ethereal cấp; đăng nhập https://ethereal.email/login bằng user/pass in ra một lần
    const account = await nodemailer.createTestAccount();
    console.log(`[mail] Ethereal inbox: https://ethereal.email/login  user=${account.user}  pass=${account.pass}`);
    mailer = nodemailer.createTransport({
      host: account.smtp.host,
      port: account.smtp.port,
      secure: account.smtp.secure,
      auth: { user: account.user, pass: account.pass },
    });
  } else {
    // file: dựng thư hoàn chỉnh (MIME) rồi ghi ra đĩa
    mailer = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "unix" });
  }
  return {
    async send(message) {
      const info = await mailer.sendMail(message);
      return { id: info.messageId, raw: info.message };
    },
  };
}

function transport() {
  if (!transportPromise) {
    transportPromise = createTransport().catch((err) => {
      transportPromise = null; // lần sau thử tạo lại
      throw err;
    });
  }
  return transportPromise;
}

// "an@example.com" -> "a***@example.com"
function maskEmail(email) {
  const [local, domain] = String(email).split("@");
  return (local ? local[0] : "") + "***@" + (domain || "");
}

async function sendMail({ to, subject, text, html, kind }) {
  const t = await transport();
  const result = await t.send({ from: fromAddress(), to, subject, text, html });

  if (mode() === "file") {
    await fs.mkdir(OUTBOX, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const base = `${stamp}-${kind}-${String(to).replace(/[^a-z0-9@.+-]/gi, "_")}`;
    await fs.writeFile(path.join(OUTBOX, base + ".eml"), result.raw);
    await fs.writeFile(path.join(OUTBOX, base + ".html"), html);
    console.log(`[mail] ${kind} -> ${maskEmail(to)} (mail-outbox/${base}.html)`);
  } else {
    console.log(`[mail] ${kind} -> ${maskEmail(to)} (${mode()}${result.id ? ", id " + result.id : ""})`);
  }
  return result;
}

// Gửi bất đồng bộ: request không chờ gửi xong, nên thời gian phản hồi của nhánh có gửi thư
// và nhánh không gửi gần như nhau. Lỗi gửi ghi mã lỗi và thông báo của dịch vụ, không ghi nội dung thư.
function queueMail(message) {
  setImmediate(() => {
    sendMail(message).catch((err) => {
      const detail = String(err.message || "").slice(0, 200);
      console.error(`[mail] gửi ${message.kind} tới ${maskEmail(message.to)} thất bại: ${err.code || err.name} ${detail}`);
    });
  });
}

module.exports = { queueMail, sendMail, maskEmail, checkMailConfig, OUTBOX };

// Gửi thử (trong thư mục api): npm run mail:test -- you@example.com
if (require.main === module) {
  require("dotenv").config();
  const to = process.argv[2];
  try {
    checkMailConfig();
    if (!to) throw new Error("Cách dùng: npm run mail:test -- you@example.com");
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
  sendMail({
    to,
    kind: "test",
    subject: "Lửa Hồng: thử cấu hình email",
    text: "Nếu bạn đọc được thư này, cấu hình gửi email đã hoạt động.",
    html: "<p>Nếu bạn đọc được thư này, cấu hình gửi email của <strong>Lửa Hồng</strong> đã hoạt động.</p>",
  })
    .then(() => console.log("Đã gửi thử."))
    .catch((err) => {
      console.error(`Gửi thử thất bại: ${err.code || err.name} ${err.message}`);
      process.exitCode = 1;
    });
}
