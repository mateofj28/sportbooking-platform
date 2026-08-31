-- Add venue_id to users (VENUE_ADMIN assignment)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "venue_id" TEXT;

-- Add dni to users
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "dni" TEXT;

-- Add profit_percent to pricing
ALTER TABLE "pricing" ADD COLUMN IF NOT EXISTS "profit_percent" DECIMAL(5,2) NOT NULL DEFAULT 0;

-- Unique index for dni
CREATE UNIQUE INDEX IF NOT EXISTS "users_dni_key" ON "users"("dni");

-- Foreign key: users.venue_id -> venues.id
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'users_venue_id_fkey'
    ) THEN
        ALTER TABLE "users" ADD CONSTRAINT "users_venue_id_fkey"
            FOREIGN KEY ("venue_id") REFERENCES "venues"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END$$;
