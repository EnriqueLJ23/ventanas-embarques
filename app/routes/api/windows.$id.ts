import type { Route } from "./+types/windows.$id";
import { requireUser } from "~/lib/session.server";
import { prisma } from "~/lib/db.server";
import { logActivity } from "~/lib/activity.server";
import { findOverlappingWindow } from "~/lib/validations/windowOverlap";
import { buildQrPayload } from "~/lib/qr";

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireUser(request);
  const window = await prisma.window.findUniqueOrThrow({
    where: { id: params.id },
    include: { client: true, warehouse: true, overrideRequest: true },
  });
  return Response.json(window);
}

export async function action({ request, params }: Route.ActionArgs) {
  const user = await requireUser(request, ["ADMINISTRADOR"]);
  const body = await request.json();

  const existing = await prisma.window.findUniqueOrThrow({ where: { id: params.id } });
  if (existing.status !== "SCHEDULED") {
    return Response.json({ error: "not_editable" }, { status: 409 });
  }

  const client = await prisma.client.findUnique({ where: { id: body.clientId } });
  if (!client) {
    return Response.json({ error: "client_not_found" }, { status: 400 });
  }
  const warehouse = await prisma.warehouse.findUnique({ where: { id: body.warehouseId } });
  if (!warehouse) {
    return Response.json({ error: "warehouse_not_found" }, { status: 400 });
  }

  const scheduledStart = new Date(body.scheduledStart);
  const scheduledEnd = new Date(scheduledStart.getTime() + client.avgLoadTime * 60000);

  const sameWarehouseWindows = await prisma.window.findMany({
    where: { warehouseId: body.warehouseId, status: { not: "CANCELLED" } },
  });
  const conflict = findOverlappingWindow(
    { warehouseId: body.warehouseId, scheduledStart, scheduledEnd, excludeId: params.id },
    sameWarehouseWindows
  );

  const updatedWindow = await prisma.window.update({
    where: { id: params.id },
    data: {
      clientId: body.clientId,
      warehouseId: body.warehouseId,
      scheduledStart,
      scheduledEnd,
      operatorName: body.operatorName,
      licensePlate: body.licensePlate,
      type: client.type,
    },
    include: { client: true, warehouse: true },
  });

  const qrPayload = buildQrPayload(updatedWindow);
  const window = await prisma.window.update({
    where: { id: updatedWindow.id },
    data: { qrCode: qrPayload },
    include: { client: true, warehouse: true },
  });

  await logActivity({
    userId: user.id,
    action: "UPDATE",
    entity: "Window",
    entityId: window.id,
    detail: `Ventana editada para ${client.name}`,
  });

  return Response.json({ window, conflict: !!conflict });
}
