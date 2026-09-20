-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "emailError" TEXT,
ADD COLUMN     "emailStatus" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "notifiedAt" TIMESTAMP(3),
ADD COLUMN     "whatsappError" TEXT,
ADD COLUMN     "whatsappStatus" "DeliveryStatus" NOT NULL DEFAULT 'PENDING';
