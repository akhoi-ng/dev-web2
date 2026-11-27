import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import type { PrismaClient, User } from "@prisma/client";
import type { Config } from "../config.js";
import { forbidden, unauthorized } from "../errors.js";

export const SESSION_COOKIE = "gallery_session";
const BCRYPT_ROUNDS = 12;

export const hashPassword = (password: string) => bcrypt.hash(password, BCRYPT_ROUNDS);
export const verifyPassword = (password: string, hash: string) => bcrypt.compare(password, hash);

// Hash giả để so sánh khi email không tồn tại: thời gian phản hồi không lộ email nào có tài khoản
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", BCRYPT_ROUNDS);
export const burnPasswordCheck = (password: string) => bcrypt.compare(password, DUMMY_HASH);

export type SessionUser = Pick<User, "id" | "email" | "name">;

declare module "express-serve-static-core" {
  interface Request {
    user?: SessionUser;
  }
}

interface TokenPayload {
  sub: string;
  ver: number;
}

export class Sessions {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly config: Config,
  ) {}

  issue(res: Response, user: Pick<User, "id" | "tokenVersion">): void {
    const token = jwt.sign({ sub: user.id, ver: user.tokenVersion } satisfies TokenPayload, this.config.jwtSecret, {
      algorithm: "HS256",
      expiresIn: `${this.config.sessionTtlHours}h`,
    });
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      // Strict: browser không gửi cookie trong request khởi phát từ site khác (chống CSRF)
      sameSite: "strict",
      secure: this.config.cookieSecure,
      path: "/",
      maxAge: this.config.sessionTtlHours * 3600 * 1000,
    });
  }

  clear(res: Response): void {
    res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: "strict", secure: this.config.cookieSecure, path: "/" });
  }

  /** Đọc phiên từ cookie; trả undefined nếu không có hoặc không hợp lệ. */
  async resolve(req: Request): Promise<SessionUser | undefined> {
    const token = (req.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE];
    if (!token) return undefined;
    let payload: TokenPayload;
    try {
      payload = jwt.verify(token, this.config.jwtSecret, { algorithms: ["HS256"] }) as unknown as TokenPayload;
    } catch {
      return undefined;
    }
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub }, select: { id: true, email: true, name: true, tokenVersion: true } });
    if (!user || user.tokenVersion !== payload.ver) return undefined;
    return { id: user.id, email: user.email, name: user.name };
  }

  /** Gắn req.user nếu có phiên hợp lệ, không chặn request. */
  optional = async (req: Request, _res: Response, next: NextFunction) => {
    req.user = await this.resolve(req);
    next();
  };

  /** Bắt buộc đăng nhập admin. */
  required = async (req: Request, _res: Response, next: NextFunction) => {
    req.user = await this.resolve(req);
    if (!req.user) return next(unauthorized());
    next();
  };
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Lớp chống CSRF thứ hai bên cạnh SameSite=Strict: request ghi phải mang header X-Requested-With
 * (form HTML từ site khác không đặt được header này) và nếu có Origin thì phải cùng host.
 */
export function sameOriginGuard(req: Request, _res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method)) return next();
  if (req.get("x-requested-with") !== "XMLHttpRequest") {
    return next(forbidden("Thiếu header X-Requested-With: XMLHttpRequest"));
  }
  const origin = req.get("origin");
  if (origin) {
    let host: string;
    try {
      host = new URL(origin).host;
    } catch {
      return next(forbidden("Origin không hợp lệ"));
    }
    const forwarded = req.get("x-forwarded-host");
    if (host !== req.get("host") && host !== forwarded) return next(forbidden("Request đến từ origin khác"));
  }
  next();
}
