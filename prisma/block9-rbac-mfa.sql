-- Block 9 Bài 2: phân quyền (RBAC/ABAC) và MFA. Thêm cột và bảng mà KHÔNG chạy `prisma db push`
-- (db push sẽ xóa index trigram của tìm kiếm Block 7 vì index đó tạo bằng search.sql).
-- Chạy được nhiều lần: npm run db:block9-2
-- Bản SSR và bản API dùng chung database, nên chỉ cần chạy một lần.

-- Món ăn: draft | published. Lần chạy đầu, mọi món đang có nhận 'published' (thực đơn công khai
-- không bị trống); sau đó mặc định đổi thành 'draft' cho món tạo mới. ADD COLUMN IF NOT EXISTS
-- không làm gì ở lần chạy sau, nên món draft không bị đăng lại.
ALTER TABLE "dishes" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'published';
ALTER TABLE "dishes" ALTER COLUMN "status" SET DEFAULT 'draft';
CREATE INDEX IF NOT EXISTS "dishes_status_idx" ON "dishes"("status");

-- Tài khoản: đầu bếp gắn với Editor, MFA
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "chefId" INTEGER;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "mfaEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "mfaSecret" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "mfaPendingSecret" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "mfaLastStep" INTEGER;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_chefId_fkey') THEN
    ALTER TABLE "users" ADD CONSTRAINT "users_chefId_fkey" FOREIGN KEY ("chefId")
      REFERENCES "chefs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "recovery_codes" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "recovery_codes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "recovery_codes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "recovery_codes_userId_idx" ON "recovery_codes"("userId");

CREATE TABLE IF NOT EXISTS "mfa_challenges" (
    "id" SERIAL NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "next" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "mfa_challenges_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "mfa_challenges_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "mfa_challenges_tokenHash_key" ON "mfa_challenges"("tokenHash");
CREATE INDEX IF NOT EXISTS "mfa_challenges_userId_idx" ON "mfa_challenges"("userId");
