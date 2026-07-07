import { describe, it, expect } from "vitest";
import {
  computePuntualidad,
  computeTiempo,
  computeOperacionRealizadas,
  computeRetrasos,
  PUNTUALIDAD_THRESHOLD_MINUTES,
  type WindowForIndicators,
} from "./reportIndicators";

const BASE_START = new Date("2026-07-01T10:00:00Z");

function makeWindow(overrides: Partial<WindowForIndicators> = {}): WindowForIndicators {
  return {
    clientName: "Cliente A",
    type: "CARGA",
    status: "SCHEDULED",
    scheduledStart: BASE_START,
    actualArrival: null,
    actualEnd: null,
    delayReasonCategory: null,
    ...overrides,
  };
}

function minutesAfter(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

describe("computePuntualidad", () => {
  it("counts an unattended window as programada but not atendida", () => {
    const result = computePuntualidad([makeWindow()]);
    expect(result).toEqual({
      citasProgramadas: 1,
      citasAtendidas: 0,
      llegadasPuntuales: 0,
      llegadasTardias: 0,
      porcentajeCumplimiento: 0,
    });
  });

  it("treats arrival exactly at the threshold as puntual", () => {
    const w = makeWindow({ actualArrival: minutesAfter(BASE_START, PUNTUALIDAD_THRESHOLD_MINUTES) });
    const result = computePuntualidad([w]);
    expect(result.llegadasPuntuales).toBe(1);
    expect(result.llegadasTardias).toBe(0);
  });

  it("treats arrival one minute past the threshold as tardía", () => {
    const w = makeWindow({ actualArrival: minutesAfter(BASE_START, PUNTUALIDAD_THRESHOLD_MINUTES + 1) });
    const result = computePuntualidad([w]);
    expect(result.llegadasPuntuales).toBe(0);
    expect(result.llegadasTardias).toBe(1);
  });

  it("treats an early arrival as puntual", () => {
    const w = makeWindow({ actualArrival: minutesAfter(BASE_START, -30) });
    const result = computePuntualidad([w]);
    expect(result.llegadasPuntuales).toBe(1);
  });

  it("computes porcentajeCumplimiento over all scheduled windows, not just attended ones", () => {
    const puntual = makeWindow({ actualArrival: BASE_START });
    const neverArrived = makeWindow();
    const result = computePuntualidad([puntual, neverArrived]);
    expect(result.citasProgramadas).toBe(2);
    expect(result.porcentajeCumplimiento).toBe(50);
  });
});

describe("computeTiempo", () => {
  it("averages load/unload time (arrival to completion) only for COMPLETED windows, split by type", () => {
    const carga = makeWindow({
      type: "CARGA",
      status: "COMPLETED",
      actualArrival: BASE_START,
      actualEnd: minutesAfter(BASE_START, 45),
    });
    const descarga = makeWindow({
      type: "DESCARGA",
      status: "COMPLETED",
      actualArrival: BASE_START,
      actualEnd: minutesAfter(BASE_START, 10),
    });
    const result = computeTiempo([carga, descarga]);
    expect(result.tiempoPromedioCarga).toBe(45);
    expect(result.tiempoPromedioDescarga).toBe(10);
  });

  it("excludes non-COMPLETED windows from load/unload/total-time averages", () => {
    const inProgress = makeWindow({
      type: "CARGA",
      status: "IN_PROGRESS",
      actualArrival: BASE_START,
    });
    const result = computeTiempo([inProgress]);
    expect(result.tiempoPromedioCarga).toBeNull();
    expect(result.tiempoPromedioTotalEnPlanta).toBeNull();
  });

  it("averages total time on site from arrival to completion", () => {
    const w = makeWindow({
      status: "COMPLETED",
      actualArrival: BASE_START,
      actualEnd: minutesAfter(BASE_START, 70),
    });
    const result = computeTiempo([w]);
    expect(result.tiempoPromedioTotalEnPlanta).toBe(70);
  });
});

describe("computeOperacionRealizadas", () => {
  it("counts only COMPLETED windows by type", () => {
    const completedCarga = makeWindow({ type: "CARGA", status: "COMPLETED" });
    const scheduledCarga = makeWindow({ type: "CARGA", status: "SCHEDULED" });
    const completedDescarga = makeWindow({ type: "DESCARGA", status: "COMPLETED" });
    const result = computeOperacionRealizadas([completedCarga, scheduledCarga, completedDescarga]);
    expect(result).toEqual({ cargasRealizadas: 1, descargasRealizadas: 1 });
  });
});

describe("computeRetrasos", () => {
  it("counts a window with only a categorized delay as one incident", () => {
    const w = makeWindow({
      clientName: "Cliente A",
      actualArrival: BASE_START,
      delayReasonCategory: { id: "delayreason_falta_material_pt", label: "Falta de material en PT" },
    });
    const result = computeRetrasos([w]);
    expect(result.porTransportista).toEqual([{ clientName: "Cliente A", count: 1 }]);
    expect(result.porMotivo).toEqual([
      { id: "delayreason_falta_material_pt", label: "Falta de material en PT", count: 1 },
    ]);
  });

  it("counts a window with only a late arrival as one incident, absent from porMotivo", () => {
    const w = makeWindow({
      clientName: "Cliente A",
      actualArrival: minutesAfter(BASE_START, PUNTUALIDAD_THRESHOLD_MINUTES + 5),
    });
    const result = computeRetrasos([w]);
    expect(result.porTransportista).toEqual([{ clientName: "Cliente A", count: 1 }]);
    expect(result.porMotivo).toEqual([]);
  });

  it("does not double-count a window with both a late arrival and a categorized delay", () => {
    const w = makeWindow({
      clientName: "Cliente A",
      actualArrival: minutesAfter(BASE_START, PUNTUALIDAD_THRESHOLD_MINUTES + 5),
      delayReasonCategory: { id: "delayreason_cambio_requerimiento", label: "Cambio de requerimiento" },
    });
    const result = computeRetrasos([w]);
    expect(result.porTransportista).toEqual([{ clientName: "Cliente A", count: 1 }]);
  });

  it("excludes clients with zero incidents from porTransportista", () => {
    const w = makeWindow({ clientName: "Cliente Puntual", actualArrival: BASE_START });
    const result = computeRetrasos([w]);
    expect(result.porTransportista).toEqual([]);
  });

  it("ranks masPuntuales by percentage descending and caps at 5", () => {
    const clients = Array.from({ length: 6 }, (_, i) => {
      const late = i < 1;
      return makeWindow({
        clientName: `Cliente ${i}`,
        actualArrival: late
          ? minutesAfter(BASE_START, PUNTUALIDAD_THRESHOLD_MINUTES + 5)
          : BASE_START,
      });
    });
    const result = computeRetrasos(clients);
    expect(result.masPuntuales).toHaveLength(5);
    expect(result.masPuntuales[0].porcentajePuntual).toBe(100);
    expect(result.masPuntuales.some((r) => r.clientName === "Cliente 0")).toBe(false);
  });

  it("ranks masIncidencias by count descending", () => {
    const twoIncidents = [
      makeWindow({ clientName: "Cliente A", delayReasonCategory: { id: "delayreason_otro", label: "Otro" } }),
      makeWindow({ clientName: "Cliente A", delayReasonCategory: { id: "delayreason_otro", label: "Otro" } }),
    ];
    const oneIncident = [makeWindow({ clientName: "Cliente B", delayReasonCategory: { id: "delayreason_otro", label: "Otro" } })];
    const result = computeRetrasos([...twoIncidents, ...oneIncident]);
    expect(result.masIncidencias[0]).toEqual({ clientName: "Cliente A", count: 2 });
    expect(result.masIncidencias[1]).toEqual({ clientName: "Cliente B", count: 1 });
  });
});
