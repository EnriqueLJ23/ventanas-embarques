import type { Route } from "./+types/windows.$id.complete";
import type { DelayReasonCategory } from "@prisma/client";
import { requireUser } from "~/lib/session.server";
import { prisma } from "~/lib/db.server";
import { logActivity } from "~/lib/activity.server";
import { DELAY_REASON_CATEGORY_LABEL } from "~/lib/delayReasons";

export async function action({ request, params }: Route.ActionArgs) {
  const user = await requireUser(request, ["CARGA", "DESCARGA", "ADMINISTRADOR"]);
  const body = await request.json();

  const existing = await prisma.window.findUniqueOrThrow({
    where: { id: params.id },
    include: { client: true },
  });
  const actualStart = existing.actualStart ?? new Date();
  const actualEnd = new Date();
  const actualMinutes = (actualEnd.getTime() - actualStart.getTime()) / 60000;

  if (actualMinutes > existing.client.avgLoadTime && !body.delayReasonCategory) {
    return Response.json({ error: "delay_reason_required" }, { status: 400 });
  }

  const window = await prisma.window.update({
    where: { id: params.id },
    data: {
      status: "COMPLETED",
      actualEnd,
      rollsCount: Number(body.rollsCount),
      delayReasonCategory: body.delayReasonCategory ?? null,
      delayReason: body.delayReason ?? null,
    },
  });

  await logActivity({
    userId: user.id,
    action: "COMPLETE",
    entity: "Window",
    entityId: window.id,
    detail: body.delayReasonCategory
      ? `Retraso: ${DELAY_REASON_CATEGORY_LABEL[body.delayReasonCategory as DelayReasonCategory]}${body.delayReason ? " — " + body.delayReason : ""}`
      : undefined,
  });

  return Response.json(window);
}
