-- AlterTable
ALTER TABLE "google_accounts"
DROP COLUMN "access_token",
DROP COLUMN "refresh_token",
DROP COLUMN "expires_at",
DROP COLUMN "token_type",
DROP COLUMN "scope",
DROP COLUMN "id_token";

-- AlterTable
ALTER TABLE "food_images" DROP COLUMN "public_url";
