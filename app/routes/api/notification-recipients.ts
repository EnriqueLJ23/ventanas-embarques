import type { Route } from "./+types/notification-recipients";
import { requireUser } from "~/lib/session.server";
import { prisma } from "~/lib/db.server";
import type { NotificationEvent } from "@prisma/client";
import { NOTIFICATION_EVENTS } from "~/lib/notificationEvents";

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request, ["ADMINISTRADOR"]);
  const recipients = await prisma.notificationRecipient.findMany({
    where: { active: true },
    orderBy: [{ user: { name: "asc" } }, { event: "asc" }],
    include: { user: { select: { id: true, name: true, email: true, active: true } } },
  });
  return Response.json(recipients);
}

export async function action({ request }: Route.ActionArgs) {
  await requireUser(request, ["ADMINISTRADOR"]);
  const body = await request.json();

  if (request.method === "DELETE") {
    await prisma.notificationRecipient.deleteMany({ where: { userId: Number(body.userId) } });
    return Response.json({ ok: true });
  }

  // Sync this user's active events to exactly the desired set in one instance
  // (create missing, reactivate/deactivate existing) instead of adding one row per event.
  const userId = Number(body.userId);
  const desired = new Set<NotificationEvent>(body.events ?? []);
  const existing = await prisma.notificationRecipient.findMany({ where: { userId } });
  const existingByEvent = new Map(existing.map((r) => [r.event, r]));

  await prisma.$transaction(
    NOTIFICATION_EVENTS.flatMap((event) => {
      const row = existingByEvent.get(event);
      const isDesired = desired.has(event);
      if (isDesired && !row) {
        return [prisma.notificationRecipient.create({ data: { event, userId, active: true } })];
      }
      if (isDesired && row && !row.active) {
        return [prisma.notificationRecipient.update({ where: { id: row.id }, data: { active: true } })];
      }
      if (!isDesired && row?.active) {
        return [prisma.notificationRecipient.update({ where: { id: row.id }, data: { active: false } })];
      }
      return [];
    }),
  );

  return Response.json({ ok: true });
}
