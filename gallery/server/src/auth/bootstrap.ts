import type { PrismaClient } from "@prisma/client";
import type { Config } from "../config.js";
import { log } from "../log.js";
import { hashPassword } from "./session.js";

/**
 * Không có trang đăng ký công khai. Khi DB chưa có tài khoản nào, tạo admin đầu tiên từ
 * ADMIN_EMAIL / ADMIN_PASSWORD trong .env. Đặt lại mật khẩu: `npm run db:seed`.
 */
export async function ensureAdmin(prisma: PrismaClient, config: Config): Promise<void> {
  const count = await prisma.user.count();
  if (count > 0) return;
  if (!config.admin) {
    log.warn("Chưa có tài khoản admin. Đặt ADMIN_EMAIL và ADMIN_PASSWORD trong .env rồi khởi động lại hoặc chạy npm run db:seed");
    return;
  }
  validateAdminPassword(config.admin.password);
  await prisma.user.create({
    data: { email: config.admin.email, passwordHash: await hashPassword(config.admin.password), name: "Admin" },
  });
  log.info("Đã tạo tài khoản admin đầu tiên", { email: config.admin.email });
}

export function validateAdminPassword(password: string): void {
  if (password.length < 10) throw new Error("ADMIN_PASSWORD cần ít nhất 10 ký tự");
}
