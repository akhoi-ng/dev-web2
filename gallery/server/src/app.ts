import fs from "node:fs";
import path from "node:path";
import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { sameOriginGuard } from "./auth/session.js";
import type { AppContext } from "./context.js";
import { errorHandler, notFoundHandler } from "./http.js";
import { adminRouter } from "./routes/admin.js";
import { authRouter } from "./routes/auth.js";
import { mediaRouter } from "./routes/media.js";
import { publicRouter } from "./routes/public.js";

function originOf(url: string | undefined): string | null {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  return new URL(url).origin;
}

export function createApp(ctx: AppContext) {
  const { config } = ctx;
  const app = express();
  app.disable("x-powered-by");
  if (config.trustProxy > 0) app.set("trust proxy", config.trustProxy);

  // Ảnh có thể nằm ở CDN/bucket khác origin (mỗi kho một domain): thêm tất cả vào img-src của CSP
  const mediaOrigins = [
    ...new Set(
      [originOf(config.mediaBaseUrl), ...config.storages.map((s) => (s.driver === "s3" ? originOf(s.s3.publicBaseUrl) : null))].filter((o): o is string =>
        Boolean(o),
      ),
    ),
  ];
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          "img-src": ["'self'", "data:", "blob:", ...mediaOrigins],
          "connect-src": ["'self'"],
        },
      },
    }),
  );

  app.get("/healthz", (_req, res) => {
    res.json({ ok: true });
  });

  // Cookie phiên cần cho cả /api lẫn /media (admin xem ảnh đang ẩn)
  app.use(cookieParser());

  // Media: không cần body parser
  app.use("/media", mediaRouter(ctx));

  app.use("/api", sameOriginGuard);
  app.use("/api", express.json({ limit: "100kb" }));
  app.use("/api/auth", authRouter(ctx));
  app.use("/api/admin", ctx.sessions.required, adminRouter(ctx));
  app.use("/api", publicRouter(ctx));
  app.use("/api", notFoundHandler);

  // Bản build của SPA (npm run build trong ../web): cùng origin với API nên cookie SameSite=Strict hoạt động
  const indexHtml = path.join(config.webDistDir, "index.html");
  if (fs.existsSync(indexHtml)) {
    app.use(
      express.static(config.webDistDir, {
        index: false,
        setHeaders(res, file) {
          // File trong assets/ có hash trong tên: cache lâu dài
          res.setHeader("Cache-Control", file.includes(`${path.sep}assets${path.sep}`) ? "public, max-age=31536000, immutable" : "no-cache");
        },
      }),
    );
    app.get("/{*splat}", (_req, res) => {
      res.setHeader("Cache-Control", "no-cache");
      res.sendFile(indexHtml);
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
