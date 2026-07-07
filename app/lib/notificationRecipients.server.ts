import { prisma } from "./db.server";
import type { NotificationEvent } from "@prisma/client";

export async function getRecipientEmails(event: NotificationEvent): Promise<string[]> {
  const recipients = await prisma.notificationRecipient.findMany({
    where: { event, active: true, user: { active: true } },
    include: { user: true },
  });
  return recipients.map((r) => r.user.email);
}

export function delayMinutesToEvent(minutes: 15 | 30 | 45 | 60): NotificationEvent {
  return `DELAY_${minutes}` as NotificationEvent;
}
