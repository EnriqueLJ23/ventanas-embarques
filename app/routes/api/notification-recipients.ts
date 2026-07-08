import type { Route } from "./+types/notification-recipients";
import { requireUser } from "~/lib/session.server";
import { prisma } from "~/lib/db.server";
import type { NotificationEvent } from "@prisma/client";

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request, ["ADMINISTRADOR"]);
  const recipients = await prisma.notificationRecipient.findMany({
    orderBy: [{ event: "asc" }, { user: { name: "asc" } }],
    include: { user: { select: { id: true, name: true, email: true, active: true } } },
  });
  return Response.json(recipients);
}

export async function action({ request }: Route.ActionArgs) {
  await requireUser(request, ["ADMINISTRADOR"]);
  const body = await request.json();

  if (request.method === "PATCH") {
    const recipient = await prisma.notificationRecipient.update({
      where: { id: body.id },
      data: {
        active: body.active ?? undefined,
        event: body.event ?? undefined,
        userId: body.userId ? Number(body.userId) : undefined,
      },
    });
    return Response.json(recipient);
  }

  if (request.method === "DELETE") {
    await prisma.notificationRecipient.delete({ where: { id: body.id } });
    return Response.json({ ok: true });
  }

  const events: NotificationEvent[] = body.events ?? [body.event];
  await prisma.notificationRecipient.createMany({
    data: events.map((event) => ({ event, userId: Number(body.userId) })),
    skipDuplicates: true,
  });
  return Response.json({ ok: true }, { status: 201 });
}
