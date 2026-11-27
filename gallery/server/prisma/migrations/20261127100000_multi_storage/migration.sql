-- Multiple storage profiles: every photo and every pending cleanup key records the
-- name of the storage it lives on (a name from STORAGE_PROFILES, never credentials).
-- Existing rows get 'default' (the legacy single-storage config). After switching to
-- STORAGE_PROFILES, rename them, e.g.: UPDATE "photos" SET "storage" = 'r2' WHERE "storage" = 'default';

-- AlterTable
ALTER TABLE "photos" ADD COLUMN "storage" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "storage_cleanups" ADD COLUMN "storage" TEXT NOT NULL DEFAULT 'default';

-- DropIndex
DROP INDEX "storage_cleanups_storage_key_key";

-- CreateIndex
CREATE INDEX "photos_storage_idx" ON "photos"("storage");

-- CreateIndex
CREATE UNIQUE INDEX "storage_cleanups_storage_storage_key_key" ON "storage_cleanups"("storage", "storage_key");
