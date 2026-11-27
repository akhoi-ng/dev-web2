-- Bonus chỉnh sửa ảnh: mỗi lần lưu là một version (v1 = bản upload). Xem model PhotoVersion.

-- AlterTable
ALTER TABLE "photos" ADD COLUMN     "version_seq" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "photo_versions" (
    "id" UUID NOT NULL,
    "photo_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "blur_data_url" TEXT,
    "crop_x" INTEGER,
    "crop_y" INTEGER,
    "crop_width" INTEGER,
    "crop_height" INTEGER,
    "rotate" INTEGER NOT NULL DEFAULT 0,
    "flip_h" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "superseded_at" TIMESTAMP(3),
    "files_cleaned_at" TIMESTAMP(3),

    CONSTRAINT "photo_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "photo_versions_superseded_at_idx" ON "photo_versions"("superseded_at");

-- CreateIndex
CREATE UNIQUE INDEX "photo_versions_photo_id_version_key" ON "photo_versions"("photo_id", "version");

-- AddForeignKey
ALTER TABLE "photo_versions" ADD CONSTRAINT "photo_versions_photo_id_fkey" FOREIGN KEY ("photo_id") REFERENCES "photos"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Dữ liệu có sẵn: version đang công bố của mỗi ảnh trở thành bản ghi v1 (không chỉnh sửa)
UPDATE "photos" SET "version_seq" = "current_version";
INSERT INTO "photo_versions" ("id", "photo_id", "version", "width", "height", "blur_data_url", "created_at")
SELECT gen_random_uuid(), "id", "current_version", "width", "height", "blur_data_url", "created_at" FROM "photos";
