-- Add amenities array to facilities (parrilla, ducha, wifi, etc.)
ALTER TABLE "facilities" ADD COLUMN IF NOT EXISTS "amenities" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
