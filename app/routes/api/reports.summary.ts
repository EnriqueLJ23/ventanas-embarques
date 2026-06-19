import type { Route } from "./+types/reports.summary";
import { requireUser } from "~/lib/session.server";
import { prisma } from "~/lib/db.server";

function buildWhere(url: URL) {
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const warehouseId = url.searchParams.get("warehouseId");
  const clientId = url.searchParams.get("clientId");
  const tierId = url.searchParams.get("tierId");
  return {
    ...(from && to ? { scheduledStart: { gte: new Date(from), lte: new Date(to) } } : {}),
    ...(warehouseId ? { warehouseId } : {}),
    ...(clientId ? { clientId } : {}),
    ...(tierId ? { client: { tierId } } : {}),
  };
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request, ["ADMINISTRADOR"]);
  const url = new URL(request.url);
  const where = buildWhere(url);

  const windows = await prisma.window.findMany({
    where,
    include: { client: true, warehouse: true },
    orderBy: { scheduledStart: "asc" },
  });

  const byClient = new Map<string, { actualSum: number; actualCount: number; estimated: number; delays: number }>();
  const byWarehouse = new Map<string, number>();
  const byDate = new Map<string, number>();

  for (const w of windows) {
    const key = w.client.name;
    const entry = byClient.get(key) ?? { actualSum: 0, actualCount: 0, estimated: w.client.avgLoadTime, delays: 0 };
    if (w.actualStart && w.actualEnd) {
      entry.actualSum += (w.actualEnd.getTime() - w.actualStart.getTime()) / 60000;
      entry.actualCount += 1;
    }
    if (w.delayReason) entry.delays += 1;
    byClient.set(key, entry);

    byWarehouse.set(w.warehouse.name, (byWarehouse.get(w.warehouse.name) ?? 0) + 1);

    const dateKey = w.scheduledStart.toISOString().slice(0, 10);
    byDate.set(dateKey, (byDate.get(dateKey) ?? 0) + (w.rollsCount ?? 0));
  }

  return Response.json({
    avgByClient: [...byClient.entries()].map(([clientName, v]) => ({
      clientName,
      avgActualMinutes: v.actualCount ? Math.round(v.actualSum / v.actualCount) : null,
      avgEstimatedMinutes: v.estimated,
    })),
    delaysByClient: [...byClient.entries()].map(([clientName, v]) => ({ clientName, count: v.delays })),
    occupancyByWarehouse: [...byWarehouse.entries()].map(([warehouseName, count]) => ({ warehouseName, count })),
    rollsByPeriod: [...byDate.entries()].map(([date, rolls]) => ({ date, rolls })),
    windows,
  });
}
