-- CreateTable
CREATE TABLE "DelayReason" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DelayReason_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DelayReason_label_key" ON "DelayReason"("label");

-- Seed default reasons (ids are stable strings, not cuids, so this migration is deterministic)
INSERT INTO "DelayReason" ("id", "label", "active") VALUES
  ('delayreason_falta_material_pt', 'Falta de material en PT', true),
  ('delayreason_retraso_operacion', 'Retrasos por operación', true),
  ('delayreason_cambio_requerimiento', 'Cambio de requerimiento', true),
  ('delayreason_otro', 'Otro', true);

-- AlterTable: add new FK column
ALTER TABLE "Window" ADD COLUMN "delayReasonId" TEXT;

-- Backfill from the old enum column before dropping it
UPDATE "Window" SET "delayReasonId" = 'delayreason_falta_material_pt' WHERE "delayReasonCategory" = 'FALTA_MATERIAL_PT';
UPDATE "Window" SET "delayReasonId" = 'delayreason_retraso_operacion' WHERE "delayReasonCategory" = 'RETRASO_OPERACION';
UPDATE "Window" SET "delayReasonId" = 'delayreason_cambio_requerimiento' WHERE "delayReasonCategory" = 'CAMBIO_REQUERIMIENTO';
UPDATE "Window" SET "delayReasonId" = 'delayreason_otro' WHERE "delayReasonCategory" = 'OTRO';

-- Drop old enum column + type
ALTER TABLE "Window" DROP COLUMN "delayReasonCategory";
DROP TYPE "DelayReasonCategory";

-- AddForeignKey
ALTER TABLE "Window" ADD CONSTRAINT "Window_delayReasonId_fkey" FOREIGN KEY ("delayReasonId") REFERENCES "DelayReason"("id") ON DELETE SET NULL ON UPDATE CASCADE;
