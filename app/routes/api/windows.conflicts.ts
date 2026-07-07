import type { Route } from "./+types/windows.conflicts";
import { requireUser } from "~/lib/session.server";
import { prisma } from "~/lib/db.server";
import { findOverlappingWindow } from "~/lib/validations/windowOverlap";

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request);
  const url = new URL(request.url);
  const warehouseId = url.searchParams.get("warehouseId");
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");
  const excludeId = url.searchParams.get("excludeId") ?? undefined;

  if (!warehouseId || !start || !end) {
    return Response.json({ conflict: null });
  }

  const sameWarehouseWindows = await prisma.window.findMany({
    where: { warehouseId, status: { not: "CANCELLED" } },
  });
  const conflict = findOverlappingWindow(
    {
      warehouseId,
      scheduledStart: new Date(start),
      scheduledEnd: new Date(end),
      excludeId,
    },
    sameWarehouseWindows
  );

  if (!conflict) return Response.json({ conflict: null });

  const conflictWindow = await prisma.window.findUnique({
    where: { id: conflict.id },
    include: { client: true },
  });
  return Response.json({ conflict: conflictWindow });
}
