import type { Route } from "./+types/windows.$id.start";
import { requireUser } from "~/lib/session.server";
import { prisma } from "~/lib/db.server";
import { logActivity } from "~/lib/activity.server";
import { canStart } from "~/lib/windowTransitions";

export async function action({ request, params }: Route.ActionArgs) {
  const user = await requireUser(request, ["CARGA", "DESCARGA", "ADMINISTRADOR"]);

  const existing = await prisma.window.findUniqueOrThrow({
    where: { id: params.id },
  });

  if (!canStart(existing.status)) {
    return Response.json({ error: "not_arrivable", window: existing }, { status: 409 });
  }

  const now = new Date();
  const window = await prisma.window.update({
    where: { id: params.id },
    data: {
      status: "IN_PROGRESS",
      actualStart: now,
      actualArrival: existing.actualArrival ?? now,
    },
  });

  await logActivity({
    userId: user.id,
    action: "START",
    entity: "Window",
    entityId: window.id,
  });

  return Response.json(window);
}
