import { data } from "react-router";
import type { Route } from "./+types/api.reminders.search";

import { requireUserId } from "~/lib/session.server";
import { prisma } from "~/lib/db.server";

export async function loader({ request }: Route.LoaderArgs) {
  const userId = await requireUserId(request);
  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";

  if (q.length < 1) return data({ reminders: [] });

  const reminders = await prisma.reminder.findMany({
    where: {
      userId,
      subject: { contains: q, mode: "insensitive" },
    },
    orderBy: [{ status: "asc" }, { scheduledAt: "asc" }],
    take: 8,
    select: {
      id: true,
      subject: true,
      toAddresses: true,
      status: true,
      scheduledAt: true,
      sentAt: true,
      updatedAt: true,
    },
  });

  return data({
    reminders: reminders.map((r) => ({
      id: r.id,
      subject: r.subject,
      recipient: r.toAddresses[0] ?? "",
      status: r.status,
      scheduledAt: r.scheduledAt?.toISOString() ?? null,
      sentAt: r.sentAt?.toISOString() ?? null,
      updatedAt: r.updatedAt.toISOString(),
      href:
        r.status === "PENDING"
          ? `/upcoming/${r.id}`
          : r.status === "SENT"
          ? `/sent/${r.id}`
          : `/drafts/${r.id}`,
    })),
  });
}
