# Indicadores clave Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the client's four indicator groups (Puntualidad, Operación, Tiempo, Retrasos — 16 metrics total) to `/reports`, computed from data that already exists on `Window`.

**Architecture:** Extract the aggregation logic into pure, Vitest-testable functions in `app/lib/reportIndicators.ts` that operate on plain objects (no Prisma dependency). `api/reports.summary.ts` splits its `where`-builder into a dimensional part (warehouse/client/tier) and a date-ranged part, adds two live-snapshot counts (units on site / pending), maps its already-fetched windows into the pure functions' input shape, and returns four new JSON fields. `reports.tsx` renders four new stat-tile/table sections using the same visual pattern as the admin dashboard.

**Tech Stack:** React Router v7, Prisma/PostgreSQL, Vitest, ShadCN `Card`/`Table` (already used in this codebase).

## Global Constraints

- No schema changes — every metric is derived from `Window` fields that already exist (`scheduledStart`, `actualArrival`, `actualStart`, `actualEnd`, `status`, `type`, `delayReasonCategory`).
- "Llegada puntual" = `actualArrival - scheduledStart <= 15 minutes`, using the shared constant `DELAY_THRESHOLDS_MINUTES[0]` from `app/lib/delayThresholds.ts` (sub-project 2) — not a separately hardcoded `15`.
- "% de cumplimiento" = `llegadasPuntuales / citasProgramadas × 100`.
- "Unidades en planta" (`ARRIVED`/`IN_PROGRESS`) and "unidades pendientes" (`SCHEDULED`) are live-snapshot counts — they respect the `warehouseId`/`clientId`/`tierId` filters but ignore the `from`/`to` date range.
- A window counts as a delay "incidencia" for a client if it arrived late (per the 15-minute rule) OR has a `delayReasonCategory` — never both counted as two incidents for the same window.
- "Retrasos por motivo" only groups by `delayReasonCategory` — late arrivals have no categorized motive, so they never appear in that breakdown.
- Excel export (`reports.export.ts`) is explicitly out of scope for this sub-project.

---

### Task 1: Pure report indicator functions (TDD)

**Files:**
- Create: `app/lib/reportIndicators.ts`
- Test: `app/lib/reportIndicators.test.ts`

**Interfaces:**
- Consumes: `DELAY_THRESHOLDS_MINUTES` (`~/lib/delayThresholds`, sub-project 2),
  `DELAY_REASON_CATEGORY_LABEL` (`~/lib/delayReasons`, sub-project 3), `WindowStatus` /
  `WindowType` / `DelayReasonCategory` types (`@prisma/client`).
- Produces: `WindowForIndicators` interface, `PUNTUALIDAD_THRESHOLD_MINUTES: number`,
  `computePuntualidad(windows)`, `computeTiempo(windows)`, `computeOperacionRealizadas(windows)`,
  `computeRetrasos(windows)` — all consumed by Task 2 (`api/reports.summary.ts`).

- [ ] **Step 1: Write the failing tests**

Create `app/lib/reportIndicators.test.ts`:

```ts
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
    actualStart: null,
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
  it("averages wait time for windows with both arrival and start", () => {
    const w = makeWindow({
      actualArrival: BASE_START,
      actualStart: minutesAfter(BASE_START, 20),
    });
    const result = computeTiempo([w]);
    expect(result.tiempoPromedioEspera).toBe(20);
  });

  it("excludes windows missing actualStart from the wait-time average", () => {
    const w = makeWindow({ actualArrival: BASE_START });
    const result = computeTiempo([w]);
    expect(result.tiempoPromedioEspera).toBeNull();
  });

  it("averages load/unload time only for COMPLETED windows, split by type", () => {
    const carga = makeWindow({
      type: "CARGA",
      status: "COMPLETED",
      actualStart: BASE_START,
      actualEnd: minutesAfter(BASE_START, 45),
    });
    const descarga = makeWindow({
      type: "DESCARGA",
      status: "COMPLETED",
      actualStart: BASE_START,
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
      actualStart: BASE_START,
    });
    const result = computeTiempo([inProgress]);
    expect(result.tiempoPromedioCarga).toBeNull();
    expect(result.tiempoPromedioTotalEnPlanta).toBeNull();
  });

  it("averages total time on site from arrival to completion", () => {
    const w = makeWindow({
      status: "COMPLETED",
      actualArrival: BASE_START,
      actualStart: minutesAfter(BASE_START, 10),
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
      delayReasonCategory: "FALTA_MATERIAL_PT",
    });
    const result = computeRetrasos([w]);
    expect(result.porTransportista).toEqual([{ clientName: "Cliente A", count: 1 }]);
    expect(result.porMotivo).toEqual([
      { category: "FALTA_MATERIAL_PT", label: "Falta de material en PT", count: 1 },
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
      delayReasonCategory: "CAMBIO_REQUERIMIENTO",
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
      makeWindow({ clientName: "Cliente A", delayReasonCategory: "OTRO" }),
      makeWindow({ clientName: "Cliente A", delayReasonCategory: "OTRO" }),
    ];
    const oneIncident = [makeWindow({ clientName: "Cliente B", delayReasonCategory: "OTRO" })];
    const result = computeRetrasos([...twoIncidents, ...oneIncident]);
    expect(result.masIncidencias[0]).toEqual({ clientName: "Cliente A", count: 2 });
    expect(result.masIncidencias[1]).toEqual({ clientName: "Cliente B", count: 1 });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run app/lib/reportIndicators.test.ts`
Expected: FAIL with "Failed to resolve import ./reportIndicators" (file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `app/lib/reportIndicators.ts`:

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run app/lib/reportIndicators.test.ts`
Expected: PASS, 17 tests passed.

- [ ] **Step 5: Commit**

```bash
git add app/lib/reportIndicators.ts app/lib/reportIndicators.test.ts
git commit -m "feat: add pure report indicator computations"
```

---

### Task 2: Wire indicators into `api/reports/summary`

**Files:**
- Modify: `app/routes/api/reports.summary.ts`

**Interfaces:**
- Consumes: `computePuntualidad`, `computeTiempo`, `computeOperacionRealizadas`,
  `computeRetrasos`, `WindowForIndicators` (`~/lib/reportIndicators`, Task 1).
- Produces: `GET /api/reports/summary` response gains `puntualidad`, `operacion`
  (`{ cargasRealizadas, descargasRealizadas, unidadesEnPlanta, unidadesPendientes }`), `tiempo`,
  `retrasos` — consumed by Task 3 (`reports.tsx`).

- [ ] **Step 1: Replace the loader**

Replace the full contents of `app/routes/api/reports.summary.ts` with:

```ts
import type { Route } from "./+types/reports.summary";
import { requireUser } from "~/lib/session.server";
import { prisma } from "~/lib/db.server";
import {
  computeOperacionRealizadas,
  computePuntualidad,
  computeRetrasos,
  computeTiempo,
  type WindowForIndicators,
} from "~/lib/reportIndicators";

function buildDimensionalWhere(url: URL) {
  const warehouseId = url.searchParams.get("warehouseId");
  const clientId = url.searchParams.get("clientId");
  const tierId = url.searchParams.get("tierId");
  return {
    ...(warehouseId ? { warehouseId } : {}),
    ...(clientId ? { clientId } : {}),
    ...(tierId ? { client: { tierId } } : {}),
  };
}

function buildWhere(url: URL) {
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  return {
    ...(from && to ? { scheduledStart: { gte: new Date(from), lte: new Date(to) } } : {}),
    ...buildDimensionalWhere(url),
  };
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request, ["ADMINISTRADOR"]);
  const url = new URL(request.url);
  const where = buildWhere(url);
  const dimensionalWhere = buildDimensionalWhere(url);

  const [windows, unidadesEnPlanta, unidadesPendientes] = await Promise.all([
    prisma.window.findMany({
      where,
      include: { client: true, warehouse: true },
      orderBy: { scheduledStart: "asc" },
    }),
    prisma.window.count({
      where: { ...dimensionalWhere, status: { in: ["ARRIVED", "IN_PROGRESS"] } },
    }),
    prisma.window.count({
      where: { ...dimensionalWhere, status: "SCHEDULED" },
    }),
  ]);

  const byClient = new Map<string, { actualSum: number; actualCount: number; estimated: number; delays: number }>();
  const byWarehouse = new Map<string, number>();
  const byDate = new Map<string, number>();

  for (const w of windows) {
    const key = w.client.name;
    const entry = byClient.get(key) ?? { actualSum: 0, actualCount: 0, estimated: w.client.avgLoadTime, delays: 0 };
    if (w.actualStart && w.actualEnd) {
      entry.actualSum += (w.actualEnd.getTime() - w.actualStart.getTime()) / 60000;
      entry.actualCount += 1;
    }
    if (w.delayReasonCategory) entry.delays += 1;
    byClient.set(key, entry);

    byWarehouse.set(w.warehouse.name, (byWarehouse.get(w.warehouse.name) ?? 0) + 1);

    const dateKey = w.scheduledStart.toISOString().slice(0, 10);
    byDate.set(dateKey, (byDate.get(dateKey) ?? 0) + (w.rollsCount ?? 0));
  }

  const indicatorInputs: WindowForIndicators[] = windows.map((w) => ({
    clientName: w.client.name,
    type: w.type,
    status: w.status,
    scheduledStart: w.scheduledStart,
    actualArrival: w.actualArrival,
    actualStart: w.actualStart,
    actualEnd: w.actualEnd,
    delayReasonCategory: w.delayReasonCategory,
  }));

  return Response.json({
    avgByClient: [...byClient.entries()].map(([clientName, v]) => ({
      clientName,
      avgActualMinutes: v.actualCount ? Math.round(v.actualSum / v.actualCount) : null,
      avgEstimatedMinutes: v.estimated,
    })),
    delaysByClient: [...byClient.entries()].map(([clientName, v]) => ({ clientName, count: v.delays })),
    occupancyByWarehouse: [...byWarehouse.entries()].map(([warehouseName, count]) => ({ warehouseName, count })),
    rollsByPeriod: [...byDate.entries()].map(([date, rolls]) => ({ date, rolls })),
    windows,
    puntualidad: computePuntualidad(indicatorInputs),
    operacion: {
      ...computeOperacionRealizadas(indicatorInputs),
      unidadesEnPlanta,
      unidadesPendientes,
    },
    tiempo: computeTiempo(indicatorInputs),
    retrasos: computeRetrasos(indicatorInputs),
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/routes/api/reports.summary.ts
git commit -m "feat: add puntualidad/operacion/tiempo/retrasos to reports summary"
```

---

### Task 3: Render the indicator sections on `/reports`

**Files:**
- Modify: `app/routes/reports.tsx`

**Interfaces:**
- Consumes: `puntualidad`, `operacion`, `tiempo`, `retrasos` fields from `GET
  /api/reports/summary` (Task 2).

- [ ] **Step 1: Add imports**

In `app/routes/reports.tsx`, change:

```tsx
import { Card, CardContent } from "~/components/ui/card";
import { TableCard } from "~/components/layout/TableCard";
import { FileSpreadsheet, FileBarChart } from "lucide-react";
```

to:

```tsx
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { TableCard } from "~/components/layout/TableCard";
import {
  FileSpreadsheet,
  FileBarChart,
  CalendarRange,
  CheckCircle2,
  Clock3,
  TimerReset,
  TrendingUp,
  Package,
  Warehouse,
} from "lucide-react";
```

- [ ] **Step 2: Insert the four indicator sections**

In `app/routes/reports.tsx`, change:

```tsx
      {summary && summary.avgByClient.length === 0 && (
```

to:

```tsx
      {summary && (
        <>
          <div className="space-y-2">
            <h2 className="text-lg font-semibold">Puntualidad</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Citas programadas</CardTitle>
                  <CalendarRange className="size-4 text-muted-foreground" />
                </CardHeader>
                <CardContent className="text-3xl font-bold">{summary.puntualidad.citasProgramadas}</CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Citas atendidas</CardTitle>
                  <CheckCircle2 className="size-4 text-muted-foreground" />
                </CardHeader>
                <CardContent className="text-3xl font-bold">{summary.puntualidad.citasAtendidas}</CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Llegadas puntuales</CardTitle>
                  <Clock3 className="size-4 text-muted-foreground" />
                </CardHeader>
                <CardContent className="text-3xl font-bold">{summary.puntualidad.llegadasPuntuales}</CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Llegadas tardías</CardTitle>
                  <TimerReset className="size-4 text-muted-foreground" />
                </CardHeader>
                <CardContent className="text-3xl font-bold">{summary.puntualidad.llegadasTardias}</CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">% Cumplimiento</CardTitle>
                  <TrendingUp className="size-4 text-muted-foreground" />
                </CardHeader>
                <CardContent className="text-3xl font-bold">{summary.puntualidad.porcentajeCumplimiento}%</CardContent>
              </Card>
            </div>
          </div>

          <div className="space-y-2">
            <h2 className="text-lg font-semibold">Operación</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Cargas realizadas</CardTitle>
                  <Package className="size-4 text-muted-foreground" />
                </CardHeader>
                <CardContent className="text-3xl font-bold">{summary.operacion.cargasRealizadas}</CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Descargas realizadas</CardTitle>
                  <Package className="size-4 text-muted-foreground" />
                </CardHeader>
                <CardContent className="text-3xl font-bold">{summary.operacion.descargasRealizadas}</CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Unidades en planta</CardTitle>
                  <Warehouse className="size-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold">{summary.operacion.unidadesEnPlanta}</p>
                  <p className="text-xs text-muted-foreground">ahora mismo</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Unidades pendientes</CardTitle>
                  <Warehouse className="size-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold">{summary.operacion.unidadesPendientes}</p>
                  <p className="text-xs text-muted-foreground">ahora mismo</p>
                </CardContent>
              </Card>
            </div>
          </div>

          <div className="space-y-2">
            <h2 className="text-lg font-semibold">Tiempo</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Espera promedio</CardTitle>
                  <Clock3 className="size-4 text-muted-foreground" />
                </CardHeader>
                <CardContent className="text-3xl font-bold">
                  {summary.tiempo.tiempoPromedioEspera != null ? `${summary.tiempo.tiempoPromedioEspera} min` : "—"}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Carga promedio</CardTitle>
                  <Clock3 className="size-4 text-muted-foreground" />
                </CardHeader>
                <CardContent className="text-3xl font-bold">
                  {summary.tiempo.tiempoPromedioCarga != null ? `${summary.tiempo.tiempoPromedioCarga} min` : "—"}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Descarga promedio</CardTitle>
                  <Clock3 className="size-4 text-muted-foreground" />
                </CardHeader>
                <CardContent className="text-3xl font-bold">
                  {summary.tiempo.tiempoPromedioDescarga != null ? `${summary.tiempo.tiempoPromedioDescarga} min` : "—"}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Total en planta</CardTitle>
                  <Clock3 className="size-4 text-muted-foreground" />
                </CardHeader>
                <CardContent className="text-3xl font-bold">
                  {summary.tiempo.tiempoPromedioTotalEnPlanta != null ? `${summary.tiempo.tiempoPromedioTotalEnPlanta} min` : "—"}
                </CardContent>
              </Card>
            </div>
          </div>

          <div className="space-y-2">
            <h2 className="text-lg font-semibold">Retrasos</h2>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <TableCard>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-4">Motivo</TableHead>
                      <TableHead className="pr-4">Conteo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summary.retrasos.porMotivo.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={2} className="text-muted-foreground pl-4">
                          Sin retrasos con motivo registrado.
                        </TableCell>
                      </TableRow>
                    )}
                    {summary.retrasos.porMotivo.map((row: any) => (
                      <TableRow key={row.category}>
                        <TableCell className="pl-4">{row.label}</TableCell>
                        <TableCell className="pr-4">{row.count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableCard>

              <TableCard>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-4">Transportista más puntual</TableHead>
                      <TableHead className="pr-4">% Puntualidad</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summary.retrasos.masPuntuales.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={2} className="text-muted-foreground pl-4">
                          Sin datos en el rango.
                        </TableCell>
                      </TableRow>
                    )}
                    {summary.retrasos.masPuntuales.map((row: any) => (
                      <TableRow key={row.clientName}>
                        <TableCell className="pl-4">{row.clientName}</TableCell>
                        <TableCell className="pr-4">{row.porcentajePuntual}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableCard>

              <TableCard>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-4">Con más incidencias</TableHead>
                      <TableHead className="pr-4">Conteo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summary.retrasos.masIncidencias.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={2} className="text-muted-foreground pl-4">
                          Sin incidencias en el rango.
                        </TableCell>
                      </TableRow>
                    )}
                    {summary.retrasos.masIncidencias.map((row: any) => (
                      <TableRow key={row.clientName}>
                        <TableCell className="pl-4">{row.clientName}</TableCell>
                        <TableCell className="pr-4">{row.count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableCard>
            </div>
          </div>
        </>
      )}

      {summary && summary.avgByClient.length === 0 && (
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/routes/reports.tsx
git commit -m "feat: render puntualidad/operacion/tiempo/retrasos on /reports"
```

---

### Task 4: End-to-end verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full automated suite**

Run: `npx vitest run && npm run typecheck`
Expected: all test files pass (including the 17 new `reportIndicators` tests), zero typecheck
errors.

- [ ] **Step 2: Start a local server against the reachable database**

Run: `docker compose up -d postgres` (if not already running), then:

Run: `DATABASE_URL="postgresql://postgres:1234@localhost:5432/app_template" npx react-router dev --port 5177`
Expected: server logs `Local: http://localhost:5177/`.

- [ ] **Step 3: Mint a session cookie**

Create a throwaway script `_verify-mint-cookie.ts` in the project root (do not commit):

```ts
import "dotenv/config";
import { createCookieSessionStorage } from "react-router";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const storage = createCookieSessionStorage({
  cookie: {
    name: "_session",
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secrets: [process.env.SESSION_SECRET!],
    secure: false,
  },
});

async function main() {
  const user = await prisma.user.findUniqueOrThrow({ where: { email: "admin@example.com" } });
  const session = await storage.getSession();
  session.set("userId", user.id);
  const cookie = await storage.commitSession(session);
  console.log(cookie.split(";")[0]);
}

main().finally(() => prisma.$disconnect());
```

Run: `DATABASE_URL="postgresql://postgres:1234@localhost:5432/app_template" npx tsx _verify-mint-cookie.ts`
Expected: prints a `_session=...` value. Use it as `<cookie>` below.

- [ ] **Step 4: Fetch the summary over a wide date range and inspect the new fields**

Run (this repo already has leftover test windows from prior sub-projects' verification, spanning
late June/early July 2026 — a wide range picks them up without creating new data):
```bash
curl -s -b "<cookie>" "http://localhost:5177/api/reports/summary?from=2026-06-01&to=2026-07-10" | node -pe "const d=JSON.parse(require('fs').readFileSync(0,'utf8')); JSON.stringify({puntualidad:d.puntualidad,operacion:d.operacion,tiempo:d.tiempo,retrasos:d.retrasos}, null, 2)"
```
Expected: valid JSON with all four keys present and shaped as designed —
`puntualidad.citasProgramadas` at least matches the number of test windows created in earlier
sub-projects' verification; `operacion.unidadesEnPlanta`/`unidadesPendientes` are non-negative
integers; `tiempo.tiempoPromedioCarga` is a number (not `undefined`) since at least one
`COMPLETED` `CARGA` window exists from sub-project 3's verification; `retrasos.porTransportista`
includes an entry for "Acero del Norte" with `count >= 1`.

- [ ] **Step 5: Confirm `/reports` renders without a server error**

Run: `curl -s -o /dev/null -w "%{http_code}\n" -b "<cookie>" "http://localhost:5177/reports"`
Expected: `200`. (This confirms the route's loader and JSX compile and execute without throwing;
it does not verify the rendered layout visually — do that in a browser separately before
considering this sub-project fully done, since no browser automation tool is available here.)

- [ ] **Step 6: Clean up**

Run: `rm -f _verify-mint-cookie.ts`

Find and stop the dev server from Step 2 (e.g. `netstat -ano | grep :5177` on Windows to find the
PID, then `taskkill //PID <pid> //T //F`).
