import type { Route } from "./+types/windows.$id";
import { requireUser } from "~/lib/session.server";
import { prisma } from "~/lib/db.server";
import { logActivity } from "~/lib/activity.server";

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireUser(request);
  const window = await prisma.window.findUniqueOrThrow({
    where: { id: params.id },
    include: { client: { include: { tier: true } }, warehouse: true, overrideRequest: true },
  });
  return Response.json(window);
}

export async function action({ request, params }: Route.ActionArgs) {
  const user = await requireUser(request, ["ADMINISTRADOR"]);
  const body = await request.json();
  const window = await prisma.window.update({
    where: { id: params.id },
    data: { status: body.status },
    include: { client: true, warehouse: true },
  });
  await logActivity({
    userId: user.id,
    action: "UPDATE",
    entity: "Window",
    entityId: window.id,
    detail: `Estado actualizado a ${body.status}`,
  });
  return Response.json(window);
}
