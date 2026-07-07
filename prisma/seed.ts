import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { DEFAULT_DELAY_REASONS } from "../app/lib/delayReasons";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const warehouses = await Promise.all(
    [1, 2, 3, 4].map((n) =>
      prisma.warehouse.upsert({
        where: { code: `N${n}` },
        update: {},
        create: { name: `Nave ${n}`, code: `N${n}` },
      })
    )
  );

  await Promise.all(
    DEFAULT_DELAY_REASONS.map((label) =>
      prisma.delayReason.upsert({
        where: { label },
        update: {},
        create: { label },
      })
    )
  );

  const clientSeeds = [
    { name: "Acero del Norte", avgLoadTime: 60, preferredWarehouseId: warehouses[0].id, defaultArrivalTime: "08:00" },
    { name: "Textiles Monterrey", avgLoadTime: 45, preferredWarehouseId: warehouses[1].id, defaultArrivalTime: "09:00" },
    { name: "Distribuidora Sureste", avgLoadTime: 90, preferredWarehouseId: warehouses[2].id, defaultArrivalTime: "10:00" },
    { name: "Logística Bajío", avgLoadTime: 30, preferredWarehouseId: warehouses[3].id, defaultArrivalTime: "11:00" },
    { name: "Comercial Pacífico", avgLoadTime: 75, preferredWarehouseId: warehouses[0].id, defaultArrivalTime: "13:00" },
  ];

  for (const c of clientSeeds) {
    await prisma.client.upsert({
      where: { name: c.name },
      update: {},
      create: {
        name: c.name,
        avgLoadTime: c.avgLoadTime,
        preferredWarehouseId: c.preferredWarehouseId,
        defaultArrivalTime: c.defaultArrivalTime,
      },
    });
  }

  await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: { role: "ADMINISTRADOR", active: true },
    create: { email: "admin@example.com", name: "Administrador", role: "ADMINISTRADOR" },
  });

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
