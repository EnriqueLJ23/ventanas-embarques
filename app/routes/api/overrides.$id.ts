import type { Route } from "./+types/overrides.$id";
import { requireUser } from "~/lib/session.server";
import { prisma } from "~/lib/db.server";
import { logActivity } from "~/lib/activity.server";

export async function action({ request, params }: Route.ActionArgs) {
  const user = await requireUser(request, ["ADMINISTRADOR"]);
  const body = await request.json();

  const overrideRequest = await prisma.overrideRequest.update({
    where: { id: params.id },
    data: { status: body.status, reviewedBy: user.id, reviewedAt: new Date() },
  });

  if (body.status === "REJECTED") {
    await prisma.window.update({
      where: { id: overrideRequest.windowId },
      data: { status: "CANCELLED" },
    });
  }

  await logActivity({
    userId: user.id,
    action: "REVIEW_OVERRIDE",
    entity: "OverrideRequest",
    entityId: overrideRequest.id,
    detail: body.status,
  });

  return Response.json(overrideRequest);
}
