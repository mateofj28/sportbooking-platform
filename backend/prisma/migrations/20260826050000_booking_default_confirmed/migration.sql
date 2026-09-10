-- Bookings are now auto-confirmed on creation (no more PENDING approval flow)
ALTER TABLE "bookings" ALTER COLUMN "status" SET DEFAULT 'CONFIRMED';

-- Migrate existing PENDING bookings to CONFIRMED (they now belong to the user)
UPDATE "bookings" SET "status" = 'CONFIRMED' WHERE "status" = 'PENDING';
