-- Drop unique index on slug if it exists
DROP INDEX IF EXISTS "sports_slug_key";

-- Remove slug and icon columns from sports
ALTER TABLE "sports" DROP COLUMN IF EXISTS "slug";
ALTER TABLE "sports" DROP COLUMN IF EXISTS "icon";
