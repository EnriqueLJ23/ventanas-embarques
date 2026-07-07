import type { Route } from "./+types/windows.$id.complete";
import { requireUser } from "~/lib/session.server";
import { prisma } from "~/lib/db.server";
import { logActivity } from "~/lib/activity.server";

export async function action({ request, params }: Route.ActionArgs) {
  const user = await requireUser(request, ["ALMACEN", "ADMINISTRADOR"]);
  const body = await request.json();

  const existing = await prisma.window.findUniqueOrThrow({
    where: { id: params.id },
    include: { client: true },
  });
  const actualEnd = new Date();
  const actualMinutes = (actualEnd.getTime() - (existing.actualArrival ?? actualEnd).getTime()) / 60000;

  if (actualMinutes > existing.client.avgLoadTime && !body.delayReasonId) {
    return Response.json({ error: "delay_reason_required" }, { status: 400 });
  }

  let delayLabel: string | undefined;
  if (body.delayReasonId) {
    const reason = await prisma.delayReason.findUnique({ where: { id: body.delayReasonId } });
    delayLabel = reason?.label;
  }

  const window = await prisma.window.update({
    where: { id: params.id },
    data: {
      status: "COMPLETED",
      actualEnd,
      rollsCount: Number(body.rollsCount),
      delayReasonId: body.delayReasonId ?? null,
      delayReason: body.delayReason ?? null,
    },
  });

  await logActivity({
    userId: user.id,
    action: "COMPLETE",
    entity: "Window",
    entityId: window.id,
    detail: delayLabel
      ? `Retraso: ${delayLabel}${body.delayReason ? " — " + body.delayReason : ""}`
      : undefined,
  });

  return Response.json(window);
}
