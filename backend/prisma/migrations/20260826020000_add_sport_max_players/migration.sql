-- Add max_players to sports
ALTER TABLE "sports" ADD COLUMN IF NOT EXISTS "max_players" INTEGER;
