import type { DelayReasonCategory } from "@prisma/client";

export const DELAY_REASON_CATEGORY_LABEL: Record<DelayReasonCategory, string> = {
  FALTA_MATERIAL_PT: "Falta de material en PT",
  RETRASO_OPERACION: "Retrasos por operación",
  CAMBIO_REQUERIMIENTO: "Cambio de requerimiento",
  OTRO: "Otro",
};
