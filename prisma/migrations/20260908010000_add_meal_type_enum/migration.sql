BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "food_entries"
    WHERE "meal_type" IS NOT NULL
      AND LOWER(TRIM("meal_type")) NOT IN ('breakfast', 'lunch', 'dinner', 'additional')
  ) OR EXISTS (
    SELECT 1
    FROM "food_lists"
    WHERE "meal_type" IS NOT NULL
      AND LOWER(TRIM("meal_type")) NOT IN ('breakfast', 'lunch', 'dinner', 'additional')
  ) THEN
    RAISE EXCEPTION 'Unsupported meal_type values exist. Fix them before applying this migration.';
  END IF;
END $$;

CREATE TYPE "MealType" AS ENUM ('breakfast', 'lunch', 'dinner', 'additional');

ALTER TABLE "food_entries"
ALTER COLUMN "meal_type" TYPE "MealType"
USING LOWER(TRIM("meal_type"))::"MealType";

ALTER TABLE "food_lists"
ALTER COLUMN "meal_type" TYPE "MealType"
USING LOWER(TRIM("meal_type"))::"MealType";

COMMIT;
