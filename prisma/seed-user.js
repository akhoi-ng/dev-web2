// Tạo (hoặc cập nhật) bốn tài khoản đã kích hoạt cho Block 9 Bài 2 (RBAC / ABAC / MFA):
//   admin                 SEED_USER_EMAIL
//   viewer                SEED_VIEWER_EMAIL    (mặc định: <tên>+viewer@<miền của SEED_USER_EMAIL>)
//   editor của đầu bếp A  SEED_EDITOR_A_EMAIL  (mặc định: <tên>+editor-a@...)
//   editor của đầu bếp B  SEED_EDITOR_B_EMAIL  (mặc định: <tên>+editor-b@...)
// Cả bốn dùng chung SEED_USER_PASSWORD (không commit). Đầu bếp A, B: Nguyễn Văn Minh, Trần Quốc Huy
// (hoặc hai đầu bếp đầu tiên nếu không có). Mỗi đầu bếp có ít nhất hai món draft để thử ABAC.
// Trạng thái MFA của tài khoản đã có không bị đổi khi seed lại.
// Chạy riêng: npm run db:seed-user   (không xóa thực đơn)
require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const { hashPassword } = require("../src/auth/crypto");
const { normalizeEmail, emailError, passwordError } = require("../src/auth/accounts");

const CHEF_A = "Nguyễn Văn Minh";
const CHEF_B = "Trần Quốc Huy";
const DRAFTS_PER_CHEF = 2;

// "an@x.vn" + "viewer" -> "an+viewer@x.vn" (thư vẫn về cùng hộp thư, tiện thử quên mật khẩu)
function tagged(email, tag) {
  const at = email.lastIndexOf("@");
  return `${email.slice(0, at)}+${tag}${email.slice(at)}`;
}

async function pickChefs(prisma) {
  const named = await prisma.chef.findMany({ where: { name: { in: [CHEF_A, CHEF_B] } } });
  const a = named.find((c) => c.name === CHEF_A);
  const b = named.find((c) => c.name === CHEF_B);
  if (a && b) return [a, b];
  const first = await prisma.chef.findMany({ orderBy: { id: "asc" }, take: 2 });
  return first.length === 2 ? first : [null, null];
}

// Mỗi đầu bếp của editor có ít nhất DRAFTS_PER_CHEF món draft (lấy các món mới nhất của đầu bếp đó)
async function ensureDrafts(prisma, chef) {
  const drafts = await prisma.dish.count({ where: { chefId: chef.id, status: "draft" } });
  if (drafts >= DRAFTS_PER_CHEF) return;
  const latest = await prisma.dish.findMany({
    where: { chefId: chef.id, status: "published" },
    orderBy: { id: "desc" },
    take: DRAFTS_PER_CHEF - drafts,
    select: { id: true },
  });
  await prisma.dish.updateMany({ where: { id: { in: latest.map((d) => d.id) } }, data: { status: "draft" } });
}

async function upsertAccount(prisma, emailInput, passwordHash, role, chefId) {
  const email = normalizeEmail(emailInput);
  const data = { emailInput, passwordHash, role, chefId, status: "active", emailVerifiedAt: new Date() };
  return prisma.user.upsert({ where: { email }, create: { email, ...data }, update: data });
}

async function seedUser(prisma) {
  const adminEmail = (process.env.SEED_USER_EMAIL || "").trim();
  const password = process.env.SEED_USER_PASSWORD || "";
  const problem = emailError(adminEmail) || passwordError(password);
  if (problem) {
    console.log(`Bỏ qua tài khoản seed (${problem}). Đặt SEED_USER_EMAIL và SEED_USER_PASSWORD trong .env.`);
    return null;
  }
  const emails = {
    admin: adminEmail,
    viewer: (process.env.SEED_VIEWER_EMAIL || "").trim() || tagged(adminEmail, "viewer"),
    editorA: (process.env.SEED_EDITOR_A_EMAIL || "").trim() || tagged(adminEmail, "editor-a"),
    editorB: (process.env.SEED_EDITOR_B_EMAIL || "").trim() || tagged(adminEmail, "editor-b"),
  };
  for (const [key, value] of Object.entries(emails)) {
    const e = emailError(value);
    if (e) throw new Error(`Email seed ${key} không hợp lệ: ${e}`);
  }

  const [chefA, chefB] = await pickChefs(prisma);
  if (!chefA) console.log("Chưa có đầu bếp: editor được tạo nhưng chưa gắn đầu bếp. Chạy npm run db:seed trước.");

  const passwordHash = await hashPassword(password);
  const users = [
    await upsertAccount(prisma, emails.admin, passwordHash, "admin", null),
    await upsertAccount(prisma, emails.viewer, passwordHash, "viewer", null),
    await upsertAccount(prisma, emails.editorA, passwordHash, "editor", chefA ? chefA.id : null),
    await upsertAccount(prisma, emails.editorB, passwordHash, "editor", chefB ? chefB.id : null),
  ];
  if (chefA) {
    await ensureDrafts(prisma, chefA);
    await ensureDrafts(prisma, chefB);
  }

  const chefName = new Map([chefA, chefB].filter(Boolean).map((c) => [c.id, c.name]));
  for (const u of users) {
    const chef = u.chefId ? `, đầu bếp ${chefName.get(u.chefId)}` : "";
    console.log(`Tài khoản seed: ${u.email} (active, role ${u.role}${chef}${u.mfaEnabled ? ", MFA bật" : ""}).`);
  }
  const counts = await prisma.dish.groupBy({ by: ["status"], _count: { _all: true } });
  console.log("Món theo trạng thái:", Object.fromEntries(counts.map((c) => [c.status, c._count._all])));
  return users[0];
}

module.exports = { seedUser };

if (require.main === module) {
  const prisma = new PrismaClient();
  seedUser(prisma)
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
