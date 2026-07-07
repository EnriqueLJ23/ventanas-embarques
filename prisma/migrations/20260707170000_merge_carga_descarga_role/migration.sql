-- Merge the CARGA and DESCARGA roles into a single ALMACEN role.
-- Postgres can't drop/rename individual enum values in place, so the enum
-- type is recreated and the column re-typed with a value mapping.
ALTER TYPE "Role" RENAME TO "Role_old";

CREATE TYPE "Role" AS ENUM ('VENTAS', 'ALMACEN', 'ADMINISTRADOR', 'GUARDIA');

ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role" USING (
  CASE "role"::text
    WHEN 'CARGA' THEN 'ALMACEN'
    WHEN 'DESCARGA' THEN 'ALMACEN'
    ELSE "role"::text
  END
)::"Role";
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'VENTAS';

DROP TYPE "Role_old";
