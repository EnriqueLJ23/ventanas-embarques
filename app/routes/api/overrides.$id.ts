import type { Route } from "./+types/overrides.$id";
import { requireUser } from "~/lib/session.server";
import { prisma } from "~/lib/db.server";
import { logActivity } from "~/lib/activity.server";

export async function action({ request, params }: Route.ActionArgs) {
  const user = await requireUser(request, ["ADMINISTRADOR"]);
  const body = await request.json();

  let overrideRequest;

  if (body.status === "REJECTED") {
    const existing = await prisma.overrideRequest.findUniqueOrThrow({
      where: { id: params.id },
    });

    const [updatedOverrideRequest] = await prisma.$transaction([
      prisma.overrideRequest.update({
        where: { id: params.id },
        data: { status: body.status, reviewedBy: user.id, reviewedAt: new Date() },
      }),
      prisma.window.update({
        where: { id: existing.windowId },
        data: { status: "CANCELLED" },
      }),
    ]);

    overrideRequest = updatedOverrideRequest;
  } else {
    overrideRequest = await prisma.overrideRequest.update({
      where: { id: params.id },
      data: { status: body.status, reviewedBy: user.id, reviewedAt: new Date() },
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
