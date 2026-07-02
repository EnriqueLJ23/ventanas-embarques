import type { WindowStatus, WindowType, DelayReasonCategory } from "@prisma/client";
import { DELAY_THRESHOLDS_MINUTES } from "./delayThresholds";
import { DELAY_REASON_CATEGORY_LABEL } from "./delayReasons";

export const PUNTUALIDAD_THRESHOLD_MINUTES = DELAY_THRESHOLDS_MINUTES[0];

export interface WindowForIndicators {
  clientName: string;
  type: WindowType;
  status: WindowStatus;
  scheduledStart: Date;
  actualArrival: Date | null;
  actualStart: Date | null;
  actualEnd: Date | null;
  delayReasonCategory: DelayReasonCategory | null;
}

function isPuntual(w: WindowForIndicators): boolean {
  if (!w.actualArrival) return false;
  return (w.actualArrival.getTime() - w.scheduledStart.getTime()) / 60000 <= PUNTUALIDAD_THRESHOLD_MINUTES;
}

export function computePuntualidad(windows: WindowForIndicators[]) {
  const citasProgramadas = windows.length;
  const atendidas = windows.filter((w) => w.actualArrival !== null);
  const citasAtendidas = atendidas.length;
  const llegadasPuntuales = atendidas.filter(isPuntual).length;
  const llegadasTardias = citasAtendidas - llegadasPuntuales;
  const porcentajeCumplimiento =
    citasProgramadas === 0 ? 0 : Math.round((llegadasPuntuales / citasProgramadas) * 100);
  return { citasProgramadas, citasAtendidas, llegadasPuntuales, llegadasTardias, porcentajeCumplimiento };
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
}

export function computeTiempo(windows: WindowForIndicators[]) {
  const esperaMinutes = windows
    .filter((w) => w.actualArrival && w.actualStart)
    .map((w) => (w.actualStart!.getTime() - w.actualArrival!.getTime()) / 60000);

  const cargaMinutes = windows
    .filter((w) => w.type === "CARGA" && w.status === "COMPLETED" && w.actualStart && w.actualEnd)
    .map((w) => (w.actualEnd!.getTime() - w.actualStart!.getTime()) / 60000);

  const descargaMinutes = windows
    .filter((w) => w.type === "DESCARGA" && w.status === "COMPLETED" && w.actualStart && w.actualEnd)
    .map((w) => (w.actualEnd!.getTime() - w.actualStart!.getTime()) / 60000);

  const totalEnPlantaMinutes = windows
    .filter((w) => w.status === "COMPLETED" && w.actualArrival && w.actualEnd)
    .map((w) => (w.actualEnd!.getTime() - w.actualArrival!.getTime()) / 60000);

  return {
    tiempoPromedioEspera: average(esperaMinutes),
    tiempoPromedioCarga: average(cargaMinutes),
    tiempoPromedioDescarga: average(descargaMinutes),
    tiempoPromedioTotalEnPlanta: average(totalEnPlantaMinutes),
  };
}

export function computeOperacionRealizadas(windows: WindowForIndicators[]) {
  return {
    cargasRealizadas: windows.filter((w) => w.type === "CARGA" && w.status === "COMPLETED").length,
    descargasRealizadas: windows.filter((w) => w.type === "DESCARGA" && w.status === "COMPLETED").length,
  };
}

interface ClientDelayStats {
  incidents: number;
  attended: number;
  puntual: number;
}

export function computeRetrasos(windows: WindowForIndicators[]) {
  const byClient = new Map<string, ClientDelayStats>();

  for (const w of windows) {
    const entry = byClient.get(w.clientName) ?? { incidents: 0, attended: 0, puntual: 0 };
    const hadArrivalDelay = w.actualArrival !== null && !isPuntual(w);
    const hadCompletionDelay = w.delayReasonCategory !== null;
    if (hadArrivalDelay || hadCompletionDelay) entry.incidents += 1;
    if (w.actualArrival !== null) {
      entry.attended += 1;
      if (!hadArrivalDelay) entry.puntual += 1;
    }
    byClient.set(w.clientName, entry);
  }

  const porTransportista = [...byClient.entries()]
    .filter(([, v]) => v.incidents > 0)
    .map(([clientName, v]) => ({ clientName, count: v.incidents }));

  const porMotivoMap = new Map<DelayReasonCategory, number>();
  for (const w of windows) {
    if (!w.delayReasonCategory) continue;
    porMotivoMap.set(w.delayReasonCategory, (porMotivoMap.get(w.delayReasonCategory) ?? 0) + 1);
  }
  const porMotivo = [...porMotivoMap.entries()].map(([category, count]) => ({
    category,
    label: DELAY_REASON_CATEGORY_LABEL[category],
    count,
  }));

  const masPuntuales = [...byClient.entries()]
    .filter(([, v]) => v.attended > 0)
    .map(([clientName, v]) => ({
      clientName,
      citasAtendidas: v.attended,
      porcentajePuntual: Math.round((v.puntual / v.attended) * 100),
    }))
    .sort((a, b) => b.porcentajePuntual - a.porcentajePuntual)
    .slice(0, 5);

  const masIncidencias = [...byClient.entries()]
    .filter(([, v]) => v.incidents > 0)
    .map(([clientName, v]) => ({ clientName, count: v.incidents }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return { porTransportista, porMotivo, masPuntuales, masIncidencias };
}
