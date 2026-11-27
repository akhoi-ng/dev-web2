-- CreateEnum
CREATE TYPE "photo_status" AS ENUM ('PUBLISHED', 'HIDDEN', 'DELETING');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT,
    "token_version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_login_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "albums" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "albums_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "photos" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "alt_text" TEXT NOT NULL,
    "description" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "album_id" UUID,
    "status" "photo_status" NOT NULL DEFAULT 'PUBLISHED',
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "source_filename" TEXT NOT NULL,
    "source_format" TEXT NOT NULL,
    "source_bytes" INTEGER NOT NULL,
    "original_key" TEXT NOT NULL,
    "original_mime" TEXT NOT NULL,
    "original_bytes" INTEGER NOT NULL,
    "current_version" INTEGER NOT NULL DEFAULT 1,
    "blur_data_url" TEXT,
    "uploaded_by_id" UUID,
    "delete_requested_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "photo_variants" (
    "id" UUID NOT NULL,
    "photo_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "mime" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "storage_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "photo_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "storage_cleanups" (
    "id" UUID NOT NULL,
    "storage_key" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "photo_id" UUID,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "storage_cleanups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "albums_slug_key" ON "albums"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "photos_original_key_key" ON "photos"("original_key");

-- CreateIndex
CREATE INDEX "photos_status_created_at_id_idx" ON "photos"("status", "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "photos_album_id_idx" ON "photos"("album_id");

-- CreateIndex
CREATE UNIQUE INDEX "photo_variants_storage_key_key" ON "photo_variants"("storage_key");

-- CreateIndex
CREATE UNIQUE INDEX "photo_variants_photo_id_version_width_key" ON "photo_variants"("photo_id", "version", "width");

-- CreateIndex
CREATE UNIQUE INDEX "storage_cleanups_storage_key_key" ON "storage_cleanups"("storage_key");

-- AddForeignKey
ALTER TABLE "photos" ADD CONSTRAINT "photos_album_id_fkey" FOREIGN KEY ("album_id") REFERENCES "albums"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photos" ADD CONSTRAINT "photos_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photo_variants" ADD CONSTRAINT "photo_variants_photo_id_fkey" FOREIGN KEY ("photo_id") REFERENCES "photos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

