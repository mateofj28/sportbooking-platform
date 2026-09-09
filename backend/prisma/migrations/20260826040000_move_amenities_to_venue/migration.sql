-- Move amenities from facilities to venues
ALTER TABLE "venues" ADD COLUMN IF NOT EXISTS "amenities" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "facilities" DROP COLUMN IF EXISTS "amenities";
