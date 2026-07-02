-- CreateEnum
CREATE TYPE "DelayReasonCategory" AS ENUM ('FALTA_MATERIAL_PT', 'RETRASO_OPERACION', 'CAMBIO_REQUERIMIENTO', 'OTRO');

-- AlterTable
ALTER TABLE "Window" ADD COLUMN     "delayReasonCategory" "DelayReasonCategory";
