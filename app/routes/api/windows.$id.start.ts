import type { Route } from "./+types/windows.$id.start";
import { requireUser } from "~/lib/session.server";
import { prisma } from "~/lib/db.server";
import { logActivity } from "~/lib/activity.server";

export async function action({ request, params }: Route.ActionArgs) {
  const user = await requireUser(request, ["CARGA", "DESCARGA", "ADMINISTRADOR"]);
  const window = await prisma.window.update({
    where: { id: params.id },
    data: { status: "IN_PROGRESS", actualStart: new Date() },
  });
  await logActivity({
    userId: user.id,
    action: "START",
    entity: "Window",
    entityId: window.id,
  });
  return Response.json(window);
}
