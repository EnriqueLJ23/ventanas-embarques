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

  const tiers = await Promise.all([
    prisma.tier.upsert({
      where: { name: "Tier 1" },
      update: {},
      create: { name: "Tier 1", priority: 1, description: "Clientes prioritarios" },
    }),
    prisma.tier.upsert({
      where: { name: "Tier 2" },
      update: {},
      create: { name: "Tier 2", priority: 2, description: "Clientes regulares" },
    }),
    prisma.tier.upsert({
      where: { name: "Tier 3" },
      update: {},
      create: { name: "Tier 3", priority: 3, description: "Clientes ocasionales" },
    }),
  ]);

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
    { name: "Acero del Norte", tier: tiers[0], avgLoadTime: 60, preferredWarehouse: warehouses[0].id, defaultArrivalTime: "08:00" },
    { name: "Textiles Monterrey", tier: tiers[0], avgLoadTime: 45, preferredWarehouse: warehouses[1].id, defaultArrivalTime: "09:00" },
    { name: "Distribuidora Sureste", tier: tiers[1], avgLoadTime: 90, preferredWarehouse: warehouses[2].id, defaultArrivalTime: "10:00" },
    { name: "Logística Bajío", tier: tiers[1], avgLoadTime: 30, preferredWarehouse: warehouses[3].id, defaultArrivalTime: "11:00" },
    { name: "Comercial Pacífico", tier: tiers[2], avgLoadTime: 75, preferredWarehouse: warehouses[0].id, defaultArrivalTime: "13:00" },
  ];

  for (const c of clientSeeds) {
    await prisma.client.upsert({
      where: { name: c.name },
      update: {},
      create: {
        name: c.name,
        tierId: c.tier.id,
        avgLoadTime: c.avgLoadTime,
        preferredWarehouse: c.preferredWarehouse,
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
