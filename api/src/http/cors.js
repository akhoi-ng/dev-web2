const cors = require("cors");

// corsOrigin: chuỗi origin cách nhau bằng dấu phẩy (xem CORS_ORIGIN trong .env.example)
function corsMiddleware(corsOrigin) {
  const origins = String(corsOrigin || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  return cors({
    origin: origins,
    methods: ["GET", "POST", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type"],
    optionsSuccessStatus: 204,
  });
}

module.exports = { corsMiddleware };
