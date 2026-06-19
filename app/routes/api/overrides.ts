import type { Route } from "./+types/overrides";
import { requireUser } from "~/lib/session.server";
import { prisma } from "~/lib/db.server";
import { logActivity } from "~/lib/activity.server";
import { buildQrPayload } from "~/lib/qr";

export async function action({ request }: Route.ActionArgs) {
  const user = await requireUser(request, ["VENTAS", "ADMINISTRADOR"]);
  const body = await request.json();

  const client = await prisma.client.findUniqueOrThrow({ where: { id: body.clientId } });
  const scheduledStart = new Date(body.scheduledStart);
  const scheduledEnd = new Date(scheduledStart.getTime() + client.avgLoadTime * 60000);

  const window = await prisma.window.create({
    data: {
      clientId: body.clientId,
      warehouseId: body.warehouseId,
      scheduledStart,
      scheduledEnd,
      operatorName: body.operatorName,
      licensePlate: body.licensePlate,
      type: body.type ?? "CARGA",
      createdBy: user.id,
    },
    include: { client: true, warehouse: true },
  });
  await prisma.window.update({
    where: { id: window.id },
    data: { qrCode: buildQrPayload(window) },
  });

  const overrideRequest = await prisma.overrideRequest.create({
    data: { windowId: window.id, requestedBy: user.id, reason: body.reason },
  });

  await logActivity({
    userId: user.id,
    action: "REQUEST_OVERRIDE",
    entity: "Window",
    entityId: window.id,
    detail: body.reason,
  });

  return Response.json({ window, overrideRequest }, { status: 201 });
}
