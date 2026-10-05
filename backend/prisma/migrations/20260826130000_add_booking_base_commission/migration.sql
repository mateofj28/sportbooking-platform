-- AlterTable
ALTER TABLE "bookings" ADD COLUMN "base_price" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "bookings" ADD COLUMN "commission_amount" DECIMAL(10,2) NOT NULL DEFAULT 0;
