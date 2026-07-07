import type { Route } from "./+types/windows";
import { requireUser } from "~/lib/session.server";
import { prisma } from "~/lib/db.server";
import { logActivity } from "~/lib/activity.server";
import { findOverlappingWindow } from "~/lib/validations/windowOverlap";
import { buildQrPayload } from "~/lib/qr";

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request);
  const url = new URL(request.url);
  const date = url.searchParams.get("date");
  const where = date
    ? {
        scheduledStart: {
          gte: new Date(`${date}T00:00:00`),
          lt: new Date(`${date}T23:59:59`),
        },
      }
    : {};
  const windows = await prisma.window.findMany({
    where,
    include: { client: true, warehouse: true },
    orderBy: { scheduledStart: "asc" },
  });
  return Response.json(windows);
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireUser(request, ["VENTAS", "ADMINISTRADOR"]);
  const body = await request.json();

  const client = await prisma.client.findUnique({ where: { id: body.clientId } });
  if (!client) {
    return Response.json({ error: "client_not_found" }, { status: 400 });
  }

  const warehouse = await prisma.warehouse.findUnique({ where: { id: body.warehouseId } });
  if (!warehouse) {
    return Response.json({ error: "warehouse_not_found" }, { status: 400 });
  }

  if (body.type !== "CARGA" && body.type !== "DESCARGA") {
    return Response.json({ error: "type_required" }, { status: 400 });
  }

  const scheduledStart = new Date(body.scheduledStart);
  const scheduledEnd = new Date(scheduledStart.getTime() + client.avgLoadTime * 60000);

  const sameWarehouseWindows = await prisma.window.findMany({
    where: { warehouseId: body.warehouseId, status: { not: "CANCELLED" } },
  });
  const conflict = findOverlappingWindow(
    { warehouseId: body.warehouseId, scheduledStart, scheduledEnd },
    sameWarehouseWindows
  );
  if (conflict) {
    const conflictWindow = await prisma.window.findUnique({
      where: { id: conflict.id },
      include: { client: true },
    });
    return Response.json({ conflict: conflictWindow }, { status: 409 });
  }

  const window = await prisma.window.create({
    data: {
      clientId: body.clientId,
      warehouseId: body.warehouseId,
      scheduledStart,
      scheduledEnd,
      operatorName: body.operatorName,
      licensePlate: body.licensePlate,
      type: body.type,
      createdBy: user.id,
    },
    include: { client: true, warehouse: true },
  });

  const qrPayload = buildQrPayload(window);
  const updated = await prisma.window.update({
    where: { id: window.id },
    data: { qrCode: qrPayload },
    include: { client: true, warehouse: true },
  });

  await logActivity({
    userId: user.id,
    action: "CREATE",
    entity: "Window",
    entityId: window.id,
    detail: `Ventana creada para ${client.name}`,
  });

  return Response.json({ window: updated, qrPayload }, { status: 201 });
}
