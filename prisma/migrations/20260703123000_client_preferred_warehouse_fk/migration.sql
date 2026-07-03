-- AlterTable: add new FK column
ALTER TABLE "Client" ADD COLUMN "preferredWarehouseId" TEXT;

-- Backfill by matching the old free-text value against Warehouse.name or Warehouse.id
UPDATE "Client" c
SET "preferredWarehouseId" = w."id"
FROM "Warehouse" w
WHERE c."preferredWarehouse" = w."name" OR c."preferredWarehouse" = w."id";

-- Drop the old free-text column
ALTER TABLE "Client" DROP COLUMN "preferredWarehouse";

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_preferredWarehouseId_fkey" FOREIGN KEY ("preferredWarehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;
