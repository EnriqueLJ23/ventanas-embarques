import { format } from "date-fns";
import { es } from "date-fns/locale";

export interface QrWindowData {
  id: string;
  client: { name: string };
  operatorName: string;
  licensePlate: string;
  warehouse: { name: string };
  scheduledStart: Date;
  scheduledEnd: Date;
}

export function buildQrPayload(w: QrWindowData): string {
  return [
    "VENTANA DE EMBARQUE",
    `Cliente: ${w.client.name}`,
    `Operador: ${w.operatorName}`,
    `Placas: ${w.licensePlate}`,
    `Nave: ${w.warehouse.name}`,
    `Fecha: ${format(w.scheduledStart, "dd/MM/yyyy", { locale: es })}`,
    `Hora: ${format(w.scheduledStart, "HH:mm")} - ${format(w.scheduledEnd, "HH:mm")}`,
    `ID: ${w.id}`,
  ].join("\n");
}
