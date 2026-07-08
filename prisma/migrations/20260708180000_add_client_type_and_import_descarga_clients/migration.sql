-- Clients can now have separate Carga and Descarga profiles (different
-- avgLoadTime/warehouse per operation type) under the same name. Existing
-- clients are all Carga-only today, which the DEFAULT below backfills.
ALTER TABLE "Client" ADD COLUMN "type" "WindowType" NOT NULL DEFAULT 'CARGA';

DROP INDEX "Client_name_key";
CREATE UNIQUE INDEX "Client_name_type_key" ON "Client"("name", "type");

-- Bulk import of the Descarga (proveedores de laminado) client list.
-- Idempotent: ON CONFLICT (name, type) DO UPDATE so re-running is safe.
-- Some names already exist as Carga clients (HFI, TTM, WBTM, SEIREN CONSIGNA)
-- with different avgLoadTime — those become separate Descarga rows, not updates
-- to the existing Carga ones, since the unique key is now (name, type).
INSERT INTO "Client" (id, name, type, "avgLoadTime", "preferredWarehouseId", "createdAt", "updatedAt") VALUES
(gen_random_uuid()::text, 'SEIREN ESPUMAS', 'DESCARGA', 90, (SELECT id FROM "Warehouse" WHERE code = 'N2'), now(), now()),
(gen_random_uuid()::text, 'SEIREN COMPRA VYNILES', 'DESCARGA', 200, (SELECT id FROM "Warehouse" WHERE code = 'N4'), now(), now()),
(gen_random_uuid()::text, 'PRODUCTORA DE NO TEJIDOS QUIMIBOND, S.A. DE C.V.', 'DESCARGA', 160, (SELECT id FROM "Warehouse" WHERE code = 'N2'), now(), now()),
(gen_random_uuid()::text, 'UREBLOCK SA DE CV', 'DESCARGA', 140, (SELECT id FROM "Warehouse" WHERE code = 'N2'), now(), now()),
(gen_random_uuid()::text, 'SPUNFAB, LTD.', 'DESCARGA', 80, (SELECT id FROM "Warehouse" WHERE code = 'N2'), now(), now()),
(gen_random_uuid()::text, 'TELAS LAPROTEX S D RL DE CV', 'DESCARGA', 95, (SELECT id FROM "Warehouse" WHERE code = 'N2'), now(), now()),
(gen_random_uuid()::text, 'AMERICAN SPECIALIZED TEXTILES, S.A. DE C.V.', 'DESCARGA', 70, (SELECT id FROM "Warehouse" WHERE code = 'N2'), now(), now()),
(gen_random_uuid()::text, 'SHIMA AMERICAN CORPORATION', 'DESCARGA', 170, (SELECT id FROM "Warehouse" WHERE code = 'N2'), now(), now()),
(gen_random_uuid()::text, 'POLIMEROS Y DERIVADOS S.A DE C,V', 'DESCARGA', 150, (SELECT id FROM "Warehouse" WHERE code = 'N2'), now(), now()),
(gen_random_uuid()::text, 'TOYO QUALITY ONE ZHEJIANG CO.,LTD', 'DESCARGA', 35, (SELECT id FROM "Warehouse" WHERE code = 'N2'), now(), now()),
(gen_random_uuid()::text, 'TOYO QUALITY ONE CORPORATION', 'DESCARGA', 35, (SELECT id FROM "Warehouse" WHERE code = 'N2'), now(), now()),
(gen_random_uuid()::text, 'ACME MILLS LLC', 'DESCARGA', 35, (SELECT id FROM "Warehouse" WHERE code = 'N2'), now(), now()),
(gen_random_uuid()::text, 'MALLEN INDUSTRIES INC', 'DESCARGA', 35, (SELECT id FROM "Warehouse" WHERE code = 'N2'), now(), now()),
(gen_random_uuid()::text, 'TELAS INDUSTRIALES NO TEJIDAS', 'DESCARGA', 35, (SELECT id FROM "Warehouse" WHERE code = 'N2'), now(), now()),
(gen_random_uuid()::text, 'ENTRETELAS BRINCO S.A. DE C.V.', 'DESCARGA', 100, (SELECT id FROM "Warehouse" WHERE code = 'N2'), now(), now()),
(gen_random_uuid()::text, 'CHORI COMERCIAL DE MEXICO, S.A. DE C.V.', 'DESCARGA', 200, (SELECT id FROM "Warehouse" WHERE code = 'N2'), now(), now()),
(gen_random_uuid()::text, 'NAGASE SAGE', 'DESCARGA', 150, (SELECT id FROM "Warehouse" WHERE code = 'N3'), now(), now()),
(gen_random_uuid()::text, 'SUMINOE', 'DESCARGA', 140, (SELECT id FROM "Warehouse" WHERE code = 'N3'), now(), now()),
(gen_random_uuid()::text, 'KASAI KOGYO', 'DESCARGA', 140, (SELECT id FROM "Warehouse" WHERE code = 'N3'), now(), now()),
(gen_random_uuid()::text, 'HFI', 'DESCARGA', 140, (SELECT id FROM "Warehouse" WHERE code = 'N3'), now(), now()),
(gen_random_uuid()::text, 'TSTECH', 'DESCARGA', 70, (SELECT id FROM "Warehouse" WHERE code = 'N3'), now(), now()),
(gen_random_uuid()::text, 'NAGASE', 'DESCARGA', 140, (SELECT id FROM "Warehouse" WHERE code = 'N3'), now(), now()),
(gen_random_uuid()::text, 'ACHILLES', 'DESCARGA', 210, (SELECT id FROM "Warehouse" WHERE code = 'N3'), now(), now()),
(gen_random_uuid()::text, 'PACKAGING', 'DESCARGA', 150, (SELECT id FROM "Warehouse" WHERE code = 'N5'), now(), now()),
(gen_random_uuid()::text, 'EMYPLA', 'DESCARGA', 40, (SELECT id FROM "Warehouse" WHERE code = 'N3'), now(), now()),
(gen_random_uuid()::text, 'SEIREN CONSIGNA', 'DESCARGA', 45, (SELECT id FROM "Warehouse" WHERE code = 'N4'), now(), now()),
(gen_random_uuid()::text, 'CARTOTUBO', 'DESCARGA', 150, (SELECT id FROM "Warehouse" WHERE code = 'N5'), now(), now()),
(gen_random_uuid()::text, 'TTM', 'DESCARGA', 100, (SELECT id FROM "Warehouse" WHERE code = 'N2'), now(), now()),
(gen_random_uuid()::text, 'WBTM', 'DESCARGA', 210, (SELECT id FROM "Warehouse" WHERE code = 'N3'), now(), now())
ON CONFLICT (name, type) DO UPDATE SET
  "avgLoadTime" = EXCLUDED."avgLoadTime",
  "preferredWarehouseId" = EXCLUDED."preferredWarehouseId",
  "updatedAt" = now();
