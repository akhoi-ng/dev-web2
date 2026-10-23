require("dotenv").config();
const { createApp } = require("./app");

const PORT = Number(process.env.PORT) || 3000;

if (!process.env.CORS_ORIGIN) {
  console.warn("CORS_ORIGIN chưa được cấu hình: trình duyệt sẽ không gọi được API từ SPA.");
}

const app = createApp({ corsOrigin: process.env.CORS_ORIGIN || "" });

app.listen(PORT, () => {
  console.log(`API đang chạy tại http://localhost:${PORT}`);
});
