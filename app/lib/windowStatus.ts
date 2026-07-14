import type { WindowStatus, WindowType } from "@prisma/client";

export const WINDOW_STATUS_LABEL: Record<WindowStatus, string> = {
  SCHEDULED: "Programada",
  ARRIVED: "Llegó a planta",
  IN_PROGRESS: "En curso",
  COMPLETED: "Completada",
  CANCELLED: "Cancelada",
};

export const WINDOW_STATUS_BADGE_VARIANT: Record<
  WindowStatus,
  "secondary" | "default" | "success" | "destructive" | "outline"
> = {
  SCHEDULED: "secondary",
  ARRIVED: "outline",
  IN_PROGRESS: "default",
  COMPLETED: "success",
  CANCELLED: "destructive",
};

export const WINDOW_TYPE_LABEL: Record<WindowType, string> = {
  CARGA: "Carga",
  DESCARGA: "Descarga",
};

/* Única fuente de verdad para el color de cada estado — la usan tanto los
   eventos de FullCalendar como la leyenda del calendario. */
export const WINDOW_STATUS_COLOR: Record<WindowStatus, string> = {
  SCHEDULED: "#64748b",
  ARRIVED: "#d97706",
  IN_PROGRESS: "#2563eb",
  COMPLETED: "#16a34a",
  CANCELLED: "#dc2626",
};
