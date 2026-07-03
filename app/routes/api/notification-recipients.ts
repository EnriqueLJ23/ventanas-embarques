import type { Route } from "./+types/notification-recipients";
import { requireUser } from "~/lib/session.server";
import { prisma } from "~/lib/db.server";

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request, ["ADMINISTRADOR"]);
  const recipients = await prisma.notificationRecipient.findMany({
    orderBy: [{ event: "asc" }, { email: "asc" }],
  });
  return Response.json(recipients);
}

export async function action({ request }: Route.ActionArgs) {
  await requireUser(request, ["ADMINISTRADOR"]);
  const body = await request.json();

  if (request.method === "PATCH") {
    const recipient = await prisma.notificationRecipient.update({
      where: { id: body.id },
      data: { active: body.active ?? undefined },
    });
    return Response.json(recipient);
  }

  if (request.method === "DELETE") {
    await prisma.notificationRecipient.delete({ where: { id: body.id } });
    return Response.json({ ok: true });
  }

  const recipient = await prisma.notificationRecipient.create({
    data: { event: body.event, email: body.email },
  });
  return Response.json(recipient, { status: 201 });
}
