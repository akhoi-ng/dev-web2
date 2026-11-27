import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import type { AppContext } from "../context.js";
import { HttpError, unauthorized } from "../errors.js";
import { parseWith } from "../http.js";
import { burnPasswordCheck, verifyPassword } from "../auth/session.js";

const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1).max(200),
});

export function authRouter(ctx: AppContext): Router {
  const { prisma, sessions } = ctx;
  const router = Router();

  // Chống dò mật khẩu: 10 lần sai / 15 phút / IP (lần đăng nhập đúng không bị tính)
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    skipSuccessfulRequests: true,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_req, _res, next) => next(new HttpError(429, "TOO_MANY_ATTEMPTS", "Sai quá nhiều lần, thử lại sau 15 phút")),
  });

  router.post("/login", loginLimiter, async (req, res) => {
    const { email, password } = parseWith(LoginSchema, req.body);
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      await burnPasswordCheck(password);
      throw unauthorized("Email hoặc mật khẩu không đúng");
    }
    if (!(await verifyPassword(password, user.passwordHash))) throw unauthorized("Email hoặc mật khẩu không đúng");
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    sessions.issue(res, user);
    res.json({ user: { id: user.id, email: user.email, name: user.name } });
  });

  router.post("/logout", (_req, res) => {
    sessions.clear(res);
    res.status(204).end();
  });

  // Khách chưa đăng nhập nhận { user: null } (200) để SPA hỏi trạng thái mà không sinh lỗi 401
  router.get("/me", sessions.optional, (req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({ user: req.user ?? null });
  });

  return router;
}
