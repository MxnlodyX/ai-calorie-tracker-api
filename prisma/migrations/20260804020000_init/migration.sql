-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "image" TEXT,
    "height_cm" DOUBLE PRECISION,
    "weight_kg" DOUBLE PRECISION,
    "diet_mode" TEXT,
    "kcal_goal" INTEGER,
    "protein_goal" DOUBLE PRECISION,
    "fat_goal" DOUBLE PRECISION,
    "carb_goal" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "google_accounts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "google_account_id" TEXT NOT NULL,
    "access_token" TEXT,
    "refresh_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "google_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_entries" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kcal" INTEGER NOT NULL,
    "protein_g" DOUBLE PRECISION,
    "fat_g" DOUBLE PRECISION,
    "carb_g" DOUBLE PRECISION,
    "image_url" TEXT,
    "meal_type" TEXT,
    "eaten_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "food_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_lists" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kcal" INTEGER NOT NULL,
    "protein_g" DOUBLE PRECISION,
    "fat_g" DOUBLE PRECISION,
    "carb_g" DOUBLE PRECISION,
    "description" TEXT,
    "image_url" TEXT,
    "meal_type" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "food_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_images" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "food_entry_id" TEXT,
    "storage_path" TEXT NOT NULL,
    "public_url" TEXT,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "food_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_analyses" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "food_image_id" TEXT,
    "food_entry_id" TEXT,
    "food_name" TEXT,
    "kcal" INTEGER,
    "protein_g" DOUBLE PRECISION,
    "fat_g" DOUBLE PRECISION,
    "carb_g" DOUBLE PRECISION,
    "confidence" DOUBLE PRECISION,
    "provider" TEXT,
    "model" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "raw_ai_response" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "google_accounts_user_id_key" ON "google_accounts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "google_accounts_google_account_id_key" ON "google_accounts"("google_account_id");

-- CreateIndex
CREATE INDEX "food_entries_user_id_idx" ON "food_entries"("user_id");

-- CreateIndex
CREATE INDEX "food_entries_user_id_eaten_at_idx" ON "food_entries"("user_id", "eaten_at");

-- CreateIndex
CREATE INDEX "food_lists_user_id_idx" ON "food_lists"("user_id");

-- CreateIndex
CREATE INDEX "food_images_user_id_idx" ON "food_images"("user_id");

-- CreateIndex
CREATE INDEX "food_images_food_entry_id_idx" ON "food_images"("food_entry_id");

-- CreateIndex
CREATE INDEX "ai_analyses_user_id_idx" ON "ai_analyses"("user_id");

-- CreateIndex
CREATE INDEX "ai_analyses_food_image_id_idx" ON "ai_analyses"("food_image_id");

-- CreateIndex
CREATE INDEX "ai_analyses_food_entry_id_idx" ON "ai_analyses"("food_entry_id");

-- AddForeignKey
ALTER TABLE "google_accounts" ADD CONSTRAINT "google_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_entries" ADD CONSTRAINT "food_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_lists" ADD CONSTRAINT "food_lists_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_images" ADD CONSTRAINT "food_images_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_images" ADD CONSTRAINT "food_images_food_entry_id_fkey" FOREIGN KEY ("food_entry_id") REFERENCES "food_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_analyses" ADD CONSTRAINT "ai_analyses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_analyses" ADD CONSTRAINT "ai_analyses_food_image_id_fkey" FOREIGN KEY ("food_image_id") REFERENCES "food_images"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_analyses" ADD CONSTRAINT "ai_analyses_food_entry_id_fkey" FOREIGN KEY ("food_entry_id") REFERENCES "food_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
