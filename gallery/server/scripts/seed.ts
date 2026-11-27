// Tạo hoặc đặt lại tài khoản admin từ ADMIN_EMAIL / ADMIN_PASSWORD. Đặt lại mật khẩu làm mọi phiên cũ hết hiệu lực.
import { config } from "./_env.js";
import { validateAdminPassword } from "../src/auth/bootstrap.js";
import { hashPassword } from "../src/auth/session.js";
import { disconnectPrisma, getPrisma } from "../src/db.js";

if (!config.admin) {
  console.error("Cần ADMIN_EMAIL và ADMIN_PASSWORD trong .env");
  process.exit(1);
}
validateAdminPassword(config.admin.password);

const prisma = getPrisma();
const passwordHash = await hashPassword(config.admin.password);
const user = await prisma.user.upsert({
  where: { email: config.admin.email },
  create: { email: config.admin.email, passwordHash, name: "Admin" },
  update: { passwordHash, tokenVersion: { increment: 1 } },
});
console.log(`Admin sẵn sàng: ${user.email}`);
await disconnectPrisma();
