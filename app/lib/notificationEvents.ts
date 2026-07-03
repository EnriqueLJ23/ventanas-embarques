import type { NotificationEvent } from "@prisma/client";

export const NOTIFICATION_EVENTS: NotificationEvent[] = [
  "ARRIVAL",
  "DELAY_15",
  "DELAY_30",
  "DELAY_45",
  "DELAY_60",
];

export const NOTIFICATION_EVENT_LABEL: Record<NotificationEvent, string> = {
  ARRIVAL: "Llegada a planta",
  DELAY_15: "Retraso de 15 minutos",
  DELAY_30: "Retraso de 30 minutos",
  DELAY_45: "Retraso de 45 minutos",
  DELAY_60: "Retraso de 60 minutos",
};
