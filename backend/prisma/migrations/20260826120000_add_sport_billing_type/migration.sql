-- CreateEnum
CREATE TYPE "BillingType" AS ENUM ('PER_SESSION', 'MONTHLY');

-- AlterTable
ALTER TABLE "sports" ADD COLUMN "billing_type" "BillingType" NOT NULL DEFAULT 'PER_SESSION';
