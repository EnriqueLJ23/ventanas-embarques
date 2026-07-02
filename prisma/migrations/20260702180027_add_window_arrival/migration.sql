-- AlterEnum
ALTER TYPE "WindowStatus" ADD VALUE 'ARRIVED';

-- AlterTable
ALTER TABLE "Window" ADD COLUMN     "actualArrival" TIMESTAMP(3);
