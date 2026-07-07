-- DropForeignKey
ALTER TABLE "Client" DROP CONSTRAINT "Client_tierId_fkey";

-- AlterTable
ALTER TABLE "Client" DROP COLUMN "tierId";

-- DropTable
DROP TABLE "Tier";
