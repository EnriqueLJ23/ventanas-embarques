# Flow Completion, Admin Rework, and User Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the gaps between the proposed shipment-window business flow and the current implementation (operation type capture, editable delay-reason and notification-recipient catalogs, corrected client/warehouse FK), reorganize the admin panels around a shared CRUD dialog and grouped navigation, and replace self-service user registration with admin-created users backed by Entra ID directory search.

**Architecture:** React Router v7 (file-based routes under `app/routes`, loaders/actions per route) + Prisma/PostgreSQL + Microsoft Entra ID (MSAL confidential client) for auth and Graph API for mail + directory search. Admin CRUD pages use manual `fetch` + `useState` + `navigate(".", { replace: true })` to refresh — this plan keeps that pattern, it does not introduce a new data-fetching library.

**Tech Stack:** React 19, React Router 7.15, Prisma 7.8 (`@prisma/adapter-pg`), PostgreSQL, `@azure/msal-node`, Vitest, Tailwind + shadcn/radix UI components.

## Global Constraints

- All user-facing copy is in Spanish, matching existing pages exactly in tone (see any `admin/*.tsx` file for reference).
- Do not introduce new npm dependencies — reuse `~/components/ui/popover.tsx`, `~/components/ui/dialog.tsx`, `~/components/ui/select.tsx`, `~/components/ui/table.tsx`, `~/components/layout/PageHeader.tsx`, `~/components/layout/TableCard.tsx`, `~/components/layout/EmptyState.tsx`, `sonner` (`toast`) for all new UI.
- Admin routes/pages continue to require `ADMINISTRADOR` role via `requireUser(request, ["ADMINISTRADOR"])`.
- Prisma migrations are hand-authored into `prisma/migrations/<timestamp>_<name>/migration.sql` following the exact numbering convention already in the repo (`prisma/migrations/`, latest is `20260702195746_add_delay_reason_category`). Use `npx prisma migrate dev` (no `--create-only`) to apply a hand-authored migration already on disk — Prisma detects it, applies it, and updates `_prisma_migrations` plus regenerates the client.
- Run `npm run typecheck` and `npm test` (vitest) after every task before committing.
- Every commit message follows the existing repo convention: short imperative subject, no body required for small tasks.

---

### Task 1: Motivo de retraso — catálogo `DelayReason` (schema, migración, captura y reportes)

**Files:**
- Modify: `prisma/schema.prisma:57-81` (Window model), `prisma/schema.prisma:96-101` (drop `DelayReasonCategory` enum, add `DelayReason` model)
- Create: `prisma/migrations/20260703120000_add_delay_reason_catalog/migration.sql`
- Modify: `app/lib/delayReasons.ts`
- Modify: `app/routes/windows/detail.tsx`
- Modify: `app/routes/api/windows.$id.complete.ts`
- Modify: `app/lib/reportIndicators.ts`
- Modify: `app/lib/reportIndicators.test.ts`
- Modify: `app/routes/api/reports.summary.ts`

**Interfaces:**
- Produces: Prisma model `DelayReason { id: String, label: String, active: Boolean }`; `Window.delayReasonId: string | null`; `Window.delayReasonCategory` (relation accessor) now resolves to `DelayReason | null` instead of an enum string.
- Produces: `WindowForIndicators.delayReasonCategory: { id: string; label: string } | null` (breaking change from the old enum-string shape).

- [ ] **Step 1: Edit `prisma/schema.prisma`**

Replace the `Window` model (current lines 57-81):

```prisma
model Window {
  id              String           @id @default(cuid())
  clientId        String
  client          Client           @relation(fields: [clientId], references: [id])
  warehouseId     String
  warehouse       Warehouse        @relation(fields: [warehouseId], references: [id])
  scheduledStart  DateTime
  scheduledEnd    DateTime
  operatorName    String
  licensePlate    String
  qrCode          String?
  status          WindowStatus     @default(SCHEDULED)
  actualArrival   DateTime?
  actualStart     DateTime?
  actualEnd       DateTime?
  rollsCount      Int?
  delayReason     String?
  delayReasonId   String?
  delayReasonCategory DelayReason? @relation(fields: [delayReasonId], references: [id])
  lastDelayNotifiedMinutes Int?
  overrideRequest OverrideRequest?
  type            WindowType       @default(CARGA)
  createdBy       Int
  createdAt       DateTime         @default(now())
  updatedAt       DateTime         @updatedAt
}
```

Replace the `enum DelayReasonCategory { ... }` block (current lines 96-101) with:

```prisma
model DelayReason {
  id        String   @id @default(cuid())
  label     String   @unique
  active    Boolean  @default(true)
  createdAt DateTime @default(now())
  windows   Window[]
}
```

- [ ] **Step 2: Create the migration file**

Create `prisma/migrations/20260703120000_add_delay_reason_catalog/migration.sql`:

```sql
-- CreateTable
CREATE TABLE "DelayReason" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DelayReason_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DelayReason_label_key" ON "DelayReason"("label");

-- Seed default reasons (ids are stable strings, not cuids, so this migration is deterministic)
INSERT INTO "DelayReason" ("id", "label", "active") VALUES
  ('delayreason_falta_material_pt', 'Falta de material en PT', true),
  ('delayreason_retraso_operacion', 'Retrasos por operación', true),
  ('delayreason_cambio_requerimiento', 'Cambio de requerimiento', true),
  ('delayreason_otro', 'Otro', true);

-- AlterTable: add new FK column
ALTER TABLE "Window" ADD COLUMN "delayReasonId" TEXT;

-- Backfill from the old enum column before dropping it
UPDATE "Window" SET "delayReasonId" = 'delayreason_falta_material_pt' WHERE "delayReasonCategory" = 'FALTA_MATERIAL_PT';
UPDATE "Window" SET "delayReasonId" = 'delayreason_retraso_operacion' WHERE "delayReasonCategory" = 'RETRASO_OPERACION';
UPDATE "Window" SET "delayReasonId" = 'delayreason_cambio_requerimiento' WHERE "delayReasonCategory" = 'CAMBIO_REQUERIMIENTO';
UPDATE "Window" SET "delayReasonId" = 'delayreason_otro' WHERE "delayReasonCategory" = 'OTRO';

-- Drop old enum column + type
ALTER TABLE "Window" DROP COLUMN "delayReasonCategory";
DROP TYPE "DelayReasonCategory";

-- AddForeignKey
ALTER TABLE "Window" ADD CONSTRAINT "Window_delayReasonId_fkey" FOREIGN KEY ("delayReasonId") REFERENCES "DelayReason"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

- [ ] **Step 3: Apply the migration**

Run: `npx prisma migrate dev`
Expected: Prisma detects the new migration folder, applies it, prints "Your database is now in sync with your schema", and regenerates `@prisma/client`.

- [ ] **Step 4: Rewrite `app/lib/delayReasons.ts`**

The enum-keyed label lookup is gone (reasons are now rows fetched from the DB); this file keeps only the seed list used by `prisma/seed.ts` for fresh databases:

```ts
export const DEFAULT_DELAY_REASONS = [
  "Falta de material en PT",
  "Retrasos por operación",
  "Cambio de requerimiento",
  "Otro",
] as const;
```

- [ ] **Step 5: Update `prisma/seed.ts` to upsert the same reasons**

Add, right after the `tiers` block (after line 35, before `clientSeeds`):

```ts
import { DEFAULT_DELAY_REASONS } from "../app/lib/delayReasons";

// ... inside main(), after tiers:
await Promise.all(
  DEFAULT_DELAY_REASONS.map((label) =>
    prisma.delayReason.upsert({
      where: { label },
      update: {},
      create: { label },
    })
  )
);
```

(Add the `import` at the top of `prisma/seed.ts` alongside the existing imports.)

- [ ] **Step 6: Update the failing test fixtures in `app/lib/reportIndicators.test.ts` first**

Replace every `delayReasonCategory: "FALTA_MATERIAL_PT"` / `"CAMBIO_REQUERIMIENTO"` / `"OTRO"` string literal with the new object shape. Full updated file:

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
```

- [ ] **Step 7: Run the test to verify it fails**

Run: `npm test -- reportIndicators`
Expected: FAIL — `reportIndicators.ts` still types `delayReasonCategory` as `DelayReasonCategory | null` and `porMotivo` groups by `category`/enum label lookup, mismatching the new fixtures.

- [ ] **Step 8: Rewrite `app/lib/reportIndicators.ts`**

```ts
import type { WindowStatus, WindowType } from "@prisma/client";
import { DELAY_THRESHOLDS_MINUTES } from "./delayThresholds";

export const PUNTUALIDAD_THRESHOLD_MINUTES = DELAY_THRESHOLDS_MINUTES[0];

export interface WindowForIndicators {
  clientName: string;
  type: WindowType;
  status: WindowStatus;
  scheduledStart: Date;
  actualArrival: Date | null;
  actualStart: Date | null;
  actualEnd: Date | null;
  delayReasonCategory: { id: string; label: string } | null;
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

  const porMotivoMap = new Map<string, { label: string; count: number }>();
  for (const w of windows) {
    if (!w.delayReasonCategory) continue;
    const entry = porMotivoMap.get(w.delayReasonCategory.id) ?? { label: w.delayReasonCategory.label, count: 0 };
    entry.count += 1;
    porMotivoMap.set(w.delayReasonCategory.id, entry);
  }
  const porMotivo = [...porMotivoMap.entries()].map(([id, v]) => ({ id, label: v.label, count: v.count }));

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

- [ ] **Step 9: Run the test to verify it passes**

Run: `npm test -- reportIndicators`
Expected: PASS (all `describe` blocks green).

- [ ] **Step 10: Update `app/routes/api/reports.summary.ts`**

In the `prisma.window.findMany` call (current lines 39-43), add `delayReasonCategory: true` to `include`:

```ts
    prisma.window.findMany({
      where,
      include: { client: true, warehouse: true, delayReasonCategory: true },
      orderBy: { scheduledStart: "asc" },
    }),
```

In the loop that builds `byClient` (current line 63), the check stays the same (`if (w.delayReasonCategory) entry.delays += 1;` — still valid, now checking object truthiness).

In `indicatorInputs` (current lines 72-81), change the last field:

```ts
  const indicatorInputs: WindowForIndicators[] = windows.map((w) => ({
    clientName: w.client.name,
    type: w.type,
    status: w.status,
    scheduledStart: w.scheduledStart,
    actualArrival: w.actualArrival,
    actualStart: w.actualStart,
    actualEnd: w.actualEnd,
    delayReasonCategory: w.delayReasonCategory
      ? { id: w.delayReasonCategory.id, label: w.delayReasonCategory.label }
      : null,
  }));
```

- [ ] **Step 11: Update `app/routes/api/windows.$id.complete.ts`**

Full replacement:

```ts
import type { Route } from "./+types/windows.$id.complete";
import { requireUser } from "~/lib/session.server";
import { prisma } from "~/lib/db.server";
import { logActivity } from "~/lib/activity.server";

export async function action({ request, params }: Route.ActionArgs) {
  const user = await requireUser(request, ["CARGA", "DESCARGA", "ADMINISTRADOR"]);
  const body = await request.json();

  const existing = await prisma.window.findUniqueOrThrow({
    where: { id: params.id },
    include: { client: true },
  });
  const actualStart = existing.actualStart ?? new Date();
  const actualEnd = new Date();
  const actualMinutes = (actualEnd.getTime() - actualStart.getTime()) / 60000;

  if (actualMinutes > existing.client.avgLoadTime && !body.delayReasonId) {
    return Response.json({ error: "delay_reason_required" }, { status: 400 });
  }

  let delayLabel: string | undefined;
  if (body.delayReasonId) {
    const reason = await prisma.delayReason.findUnique({ where: { id: body.delayReasonId } });
    delayLabel = reason?.label;
  }

  const window = await prisma.window.update({
    where: { id: params.id },
    data: {
      status: "COMPLETED",
      actualEnd,
      rollsCount: Number(body.rollsCount),
      delayReasonId: body.delayReasonId ?? null,
      delayReason: body.delayReason ?? null,
    },
  });

  await logActivity({
    userId: user.id,
    action: "COMPLETE",
    entity: "Window",
    entityId: window.id,
    detail: delayLabel
      ? `Retraso: ${delayLabel}${body.delayReason ? " — " + body.delayReason : ""}`
      : undefined,
  });

  return Response.json(window);
}
```

- [ ] **Step 12: Update `app/routes/windows/detail.tsx`**

Change the `loader` (current lines 33-40):

```ts
export async function loader({ request, params }: Route.LoaderArgs) {
  await requireUser(request);
  const [window, delayReasons] = await Promise.all([
    prisma.window.findUniqueOrThrow({
      where: { id: params.id },
      include: {
        client: { include: { tier: true } },
        warehouse: true,
        overrideRequest: true,
        delayReasonCategory: true,
      },
    }),
    prisma.delayReason.findMany({ where: { active: true }, orderBy: { label: "asc" } }),
  ]);
  return { window, delayReasons };
}
```

Remove the import `import { DELAY_REASON_CATEGORY_LABEL } from "~/lib/delayReasons";` (current line 23) — that export no longer exists.

Change the component signature and state (current lines 42-50):

```tsx
export default function WindowDetail({ loaderData }: Route.ComponentProps) {
  const { window, delayReasons } = loaderData;
  const navigate = useNavigate();
  const [qrOpen, setQrOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [rollsCount, setRollsCount] = useState("");
  const [delayReasonId, setDelayReasonId] = useState("");
  const [delayReason, setDelayReason] = useState("");
  const [needsDelayReason, setNeedsDelayReason] = useState(false);
```

Change `handleComplete` (current lines 72-94) body payload:

```ts
      body: JSON.stringify({
        rollsCount,
        delayReasonId: delayReasonId || undefined,
        delayReason: delayReason || undefined,
      }),
```

Change the display fields (current lines 152-160):

```tsx
            {window.delayReasonCategory && (
              <Field label="Motivo de retraso" value={window.delayReasonCategory.label} />
            )}
            {window.delayReason && (
              <Field label="Detalle adicional" value={window.delayReason} />
            )}
```

Change the Select in the complete dialog (current lines 182-196):

```tsx
                <div className="space-y-1">
                  <Label htmlFor="delayReasonId">Motivo del retraso</Label>
                  <Select value={delayReasonId} onValueChange={setDelayReasonId}>
                    <SelectTrigger id="delayReasonId">
                      <SelectValue placeholder="Selecciona un motivo" />
                    </SelectTrigger>
                    <SelectContent>
                      {delayReasons.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
```

Change the submit button's `disabled` condition (current line 209):

```tsx
              disabled={!rollsCount || (needsDelayReason && !delayReasonId)}
```

- [ ] **Step 13: Verify types and run all tests**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm test`
Expected: all suites pass.

- [ ] **Step 14: Manual verification**

Run: `npm run dev`, log in, open a window whose scheduled time has passed its `avgLoadTime`, click "Completar", confirm the "Motivo del retraso" dropdown lists the 4 seeded reasons, submit, then reopen the window detail and confirm "Motivo de retraso" displays the chosen label.

- [ ] **Step 15: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260703120000_add_delay_reason_catalog prisma/seed.ts app/lib/delayReasons.ts app/lib/reportIndicators.ts app/lib/reportIndicators.test.ts app/routes/api/reports.summary.ts app/routes/api/windows.$id.complete.ts app/routes/windows/detail.tsx
git commit -m "feat: make delay reason an editable catalog instead of a fixed enum"
```

---

### Task 2: Destinatarios de notificación — catálogo `NotificationRecipient`

**Files:**
- Modify: `prisma/schema.prisma` (add enum + model, at the end of the file)
- Create: `prisma/migrations/20260703121500_add_notification_recipients/migration.sql`
- Create: `app/lib/notificationEvents.ts`
- Create: `app/lib/notificationRecipients.server.ts`

**Interfaces:**
- Produces: Prisma model `NotificationRecipient { id, event: NotificationEvent, email, active }`.
- Produces: `getRecipientEmails(event: NotificationEvent): Promise<string[]>`, `delayMinutesToEvent(minutes: 15|30|45|60): NotificationEvent`, `NOTIFICATION_EVENT_LABEL: Record<NotificationEvent, string>`, `NOTIFICATION_EVENTS: NotificationEvent[]`.

- [ ] **Step 1: Append to `prisma/schema.prisma`**

Add at the end of the file, after the `ActivityLog` model:

```prisma
enum NotificationEvent {
  ARRIVAL
  DELAY_15
  DELAY_30
  DELAY_45
  DELAY_60
}

model NotificationRecipient {
  id        String            @id @default(cuid())
  event     NotificationEvent
  email     String
  active    Boolean           @default(true)
  createdAt DateTime          @default(now())

  @@unique([event, email])
}
```

- [ ] **Step 2: Create the migration**

Create `prisma/migrations/20260703121500_add_notification_recipients/migration.sql`:

```sql
-- CreateEnum
CREATE TYPE "NotificationEvent" AS ENUM ('ARRIVAL', 'DELAY_15', 'DELAY_30', 'DELAY_45', 'DELAY_60');

-- CreateTable
CREATE TABLE "NotificationRecipient" (
    "id" TEXT NOT NULL,
    "event" "NotificationEvent" NOT NULL,
    "email" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NotificationRecipient_event_email_key" ON "NotificationRecipient"("event", "email");
```

- [ ] **Step 3: Apply the migration**

Run: `npx prisma migrate dev`
Expected: applies cleanly, regenerates the client.

- [ ] **Step 4: Create `app/lib/notificationEvents.ts`**

```ts
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
```

- [ ] **Step 5: Write the failing test for the minutes→event mapping**

Create `app/lib/notificationRecipients.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { delayMinutesToEvent } from "./notificationRecipients.server";

describe("delayMinutesToEvent", () => {
  it("maps each threshold to its event", () => {
    expect(delayMinutesToEvent(15)).toBe("DELAY_15");
    expect(delayMinutesToEvent(30)).toBe("DELAY_30");
    expect(delayMinutesToEvent(45)).toBe("DELAY_45");
    expect(delayMinutesToEvent(60)).toBe("DELAY_60");
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test -- notificationRecipients`
Expected: FAIL — `./notificationRecipients.server` does not exist yet.

- [ ] **Step 7: Create `app/lib/notificationRecipients.server.ts`**

```ts
import { prisma } from "./db.server";
import type { NotificationEvent } from "@prisma/client";

export async function getRecipientEmails(event: NotificationEvent): Promise<string[]> {
  const recipients = await prisma.notificationRecipient.findMany({
    where: { event, active: true },
  });
  return recipients.map((r) => r.email);
}

export function delayMinutesToEvent(minutes: 15 | 30 | 45 | 60): NotificationEvent {
  return `DELAY_${minutes}` as NotificationEvent;
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm test -- notificationRecipients`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260703121500_add_notification_recipients app/lib/notificationEvents.ts app/lib/notificationRecipients.server.ts app/lib/notificationRecipients.test.ts
git commit -m "feat: add NotificationRecipient catalog for per-event email lists"
```

---

### Task 3: `Client.preferredWarehouseId` — corrección de FK

**Files:**
- Modify: `prisma/schema.prisma:35-47` (Client model)
- Create: `prisma/migrations/20260703123000_client_preferred_warehouse_fk/migration.sql`
- Modify: `prisma/seed.ts`
- Modify: `app/routes/api/clients.ts`
- Modify: `app/routes/admin/clients.tsx`

**Interfaces:**
- Produces: `Client.preferredWarehouseId: string | null`, relation `Client.preferredWarehouseRef: Warehouse | null`.

- [ ] **Step 1: Edit `prisma/schema.prisma`**

Replace the `Client` model (current lines 35-47):

```prisma
model Client {
  id                    String     @id @default(cuid())
  name                  String     @unique
  tierId                String
  tier                  Tier       @relation(fields: [tierId], references: [id])
  avgLoadTime           Int
  preferredWarehouseId  String?
  preferredWarehouseRef Warehouse? @relation(fields: [preferredWarehouseId], references: [id])
  defaultArrivalTime    String?
  active                Boolean    @default(true)
  windows               Window[]
  createdAt             DateTime   @default(now())
  updatedAt             DateTime   @updatedAt
}
```

Update the `Warehouse` model to add the back-relation (current lines 49-55):

```prisma
model Warehouse {
  id                String   @id @default(cuid())
  name              String   @unique
  code              String   @unique
  active            Boolean  @default(true)
  windows           Window[]
  preferredByClients Client[]
}
```

- [ ] **Step 2: Create the migration**

Create `prisma/migrations/20260703123000_client_preferred_warehouse_fk/migration.sql`:

```sql
-- AlterTable: add new FK column
ALTER TABLE "Client" ADD COLUMN "preferredWarehouseId" TEXT;

-- Backfill by matching the old free-text name against Warehouse.name
UPDATE "Client" c
SET "preferredWarehouseId" = w."id"
FROM "Warehouse" w
WHERE c."preferredWarehouse" = w."name";

-- Drop the old free-text column
ALTER TABLE "Client" DROP COLUMN "preferredWarehouse";

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_preferredWarehouseId_fkey" FOREIGN KEY ("preferredWarehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

- [ ] **Step 3: Apply the migration**

Run: `npx prisma migrate dev`
Expected: applies cleanly. Note `prisma/seed.ts` already stores `preferredWarehouse: warehouses[i].id` (a real warehouse id, not a name) — so the backfill `UPDATE` will correctly match zero seeded rows if seeded via cuid, and it's fine: re-running `npm run seed` after this migration will populate `preferredWarehouseId` correctly going forward (Step 4).

- [ ] **Step 4: Update `prisma/seed.ts`**

Change the field name in the `clientSeeds` mapping and the `create`/`update` calls (current lines 37-57):

```ts
  const clientSeeds = [
    { name: "Acero del Norte", tier: tiers[0], avgLoadTime: 60, preferredWarehouseId: warehouses[0].id, defaultArrivalTime: "08:00" },
    { name: "Textiles Monterrey", tier: tiers[0], avgLoadTime: 45, preferredWarehouseId: warehouses[1].id, defaultArrivalTime: "09:00" },
    { name: "Distribuidora Sureste", tier: tiers[1], avgLoadTime: 90, preferredWarehouseId: warehouses[2].id, defaultArrivalTime: "10:00" },
    { name: "Logística Bajío", tier: tiers[1], avgLoadTime: 30, preferredWarehouseId: warehouses[3].id, defaultArrivalTime: "11:00" },
    { name: "Comercial Pacífico", tier: tiers[2], avgLoadTime: 75, preferredWarehouseId: warehouses[0].id, defaultArrivalTime: "13:00" },
  ];

  for (const c of clientSeeds) {
    await prisma.client.upsert({
      where: { name: c.name },
      update: {},
      create: {
        name: c.name,
        tierId: c.tier.id,
        avgLoadTime: c.avgLoadTime,
        preferredWarehouseId: c.preferredWarehouseId,
        defaultArrivalTime: c.defaultArrivalTime,
      },
    });
  }
```

- [ ] **Step 5: Update `app/routes/api/clients.ts`**

Replace both `preferredWarehouse: body.preferredWarehouse ?? null` occurrences (current lines 26 and 39) with `preferredWarehouseId: body.preferredWarehouseId ?? null`.

- [ ] **Step 6: Update `app/routes/admin/clients.tsx`**

In the `loader` (current lines 42-50), change the `clients` query to include the warehouse:

```ts
export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request, ["ADMINISTRADOR"]);
  const [clients, tiers, warehouses] = await Promise.all([
    prisma.client.findMany({ include: { tier: true, preferredWarehouseRef: true }, orderBy: { name: "asc" } }),
    prisma.tier.findMany({ orderBy: { priority: "asc" } }),
    prisma.warehouse.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);
  return { clients, tiers, warehouses };
}
```

Update the `ClientWithTier` type (current line 40):

```ts
type ClientWithTier = Client & { tier: Tier; preferredWarehouseRef: { id: string; name: string } | null };
```

In `ClientForm` (current lines 52-146), rename the state field and fix the `Select` values (current lines 68, 108-126):

```tsx
  const [preferredWarehouseId, setPreferredWarehouseId] = useState(initial?.preferredWarehouseId ?? "");
```

```tsx
      <div className="space-y-1">
        <Label>Nave preferida</Label>
        <Select
          value={preferredWarehouseId || "__none__"}
          onValueChange={(v) => setPreferredWarehouseId(v === "__none__" ? "" : v)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Sin preferencia" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">Sin preferencia</SelectItem>
            {warehouses.map((w) => (
              <SelectItem key={w.id} value={w.id}>
                {w.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
```

Update `handleSave`'s payload key (current line 74):

```ts
    await onSave({ name, tierId, avgLoadTime, preferredWarehouseId, defaultArrivalTime });
```

In the table body (current lines 260-262), display the joined warehouse name:

```tsx
                  <TableCell className="text-muted-foreground">
                    {c.preferredWarehouseRef?.name ?? "—"}
                  </TableCell>
```

- [ ] **Step 7: Verify types**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 8: Manual verification**

Run: `npm run dev`, seed the DB (`npm run seed`), open `/admin/clients`, edit a client's "Nave preferida", save, and confirm the table shows the warehouse name (not a raw id or stale text).

- [ ] **Step 9: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260703123000_client_preferred_warehouse_fk prisma/seed.ts app/routes/api/clients.ts app/routes/admin/clients.tsx
git commit -m "fix: store Client.preferredWarehouse as a real foreign key"
```

---

### Task 4: Selector obligatorio de Tipo de operación (Carga/Descarga)

**Files:**
- Modify: `app/routes/calendar.tsx`
- Modify: `app/routes/api/windows.ts`

**Interfaces:**
- Consumes: existing `WINDOW_TYPE_LABEL` from `~/lib/windowStatus.ts` (`{ CARGA: "Carga", DESCARGA: "Descarga" }`).
- Produces: `POST /api/windows` now requires `type: "CARGA" | "DESCARGA"` in the body; returns 400 `{ error: "type_required" }` if missing.

- [ ] **Step 1: Update `app/routes/api/windows.ts` action to require `type`**

In the `action` function (current lines 28-90), add a check right after the `warehouse` lookup (after current line 40, before `scheduledStart`):

```ts
  if (body.type !== "CARGA" && body.type !== "DESCARGA") {
    return Response.json({ error: "type_required" }, { status: 400 });
  }
```

Change the `window` create call (current line 68) from `type: body.type ?? "CARGA",` to `type: body.type,`.

- [ ] **Step 2: Add the selector to `app/routes/calendar.tsx`**

Import the label map at the top (alongside the other `~/lib` imports, near current line 32):

```ts
import { WINDOW_TYPE_LABEL } from "~/lib/windowStatus";
```

Add state near the other new-window dialog state (current line 79, after `licensePlate`):

```ts
  const [type, setType] = useState<"CARGA" | "DESCARGA" | "">("");
```

Add the reset in `resetForm` (current line 146):

```ts
    setConflict(null); setOverrideReason(""); setType("");
```

Include `type` in the `handleSubmit` body (current lines 155-159):

```ts
      body: JSON.stringify({
        clientId, warehouseId,
        scheduledStart: start.toISOString(),
        operatorName, licensePlate, type,
      }),
```

Add the `Select` in the dialog, right after the Cliente/Nave/Separator block and before the Fecha/Hora row (insert after current line 285's `<Separator />`, before current line 287's `<div className="flex gap-3">`):

```tsx
            <div className="space-y-1">
              <Label>Tipo de operación</Label>
              <Select value={type} onValueChange={(v) => setType(v as "CARGA" | "DESCARGA")}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona Carga o Descarga" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CARGA">{WINDOW_TYPE_LABEL.CARGA}</SelectItem>
                  <SelectItem value="DESCARGA">{WINDOW_TYPE_LABEL.DESCARGA}</SelectItem>
                </SelectContent>
              </Select>
            </div>
```

Update the submit button's `disabled` condition (current lines 340-342):

```tsx
              disabled={
                !clientId || !warehouseId || !start || !operatorName || !licensePlate || !type || !!conflict
              }
```

- [ ] **Step 3: Verify types**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, open `/calendar`, click "Nueva ventana", confirm the "Tipo de operación" selector is present and the "Guardar ventana" button stays disabled until a type is chosen. Create one CARGA and one DESCARGA window, then check `/reports` — "Cargas realizadas"/"Descargas realizadas" should reflect them once completed.

- [ ] **Step 5: Commit**

```bash
git add app/routes/calendar.tsx app/routes/api/windows.ts
git commit -m "feat: require Carga/Descarga selection when scheduling a window"
```

---

### Task 5: Correo de llegada usa la lista de destinatarios configurable

**Files:**
- Modify: `app/routes/api/windows.$id.arrive.ts`

**Interfaces:**
- Consumes: `getRecipientEmails` from Task 2 (`app/lib/notificationRecipients.server.ts`).

- [ ] **Step 1: Replace the recipient logic**

Full replacement of `app/routes/api/windows.$id.arrive.ts`:

```ts
import type { Route } from "./+types/windows.$id.arrive";
import { requireUser } from "~/lib/session.server";
import { prisma } from "~/lib/db.server";
import { logActivity } from "~/lib/activity.server";
import { canArrive } from "~/lib/windowTransitions";
import { sendEmail } from "~/services/email.server";
import { WINDOW_TYPE_LABEL } from "~/lib/windowStatus";
import { getRecipientEmails } from "~/lib/notificationRecipients.server";
import { format } from "date-fns";

export async function action({ request, params }: Route.ActionArgs) {
  const user = await requireUser(request, ["CARGA", "DESCARGA", "ADMINISTRADOR"]);

  const existing = await prisma.window.findUniqueOrThrow({
    where: { id: params.id },
  });

  if (!canArrive(existing.status)) {
    return Response.json({ error: "not_scheduled", window: existing }, { status: 409 });
  }

  const actualArrival = new Date();
  const window = await prisma.window.update({
    where: { id: params.id },
    data: { status: "ARRIVED", actualArrival },
  });

  await logActivity({
    userId: user.id,
    action: "ARRIVE",
    entity: "Window",
    entityId: window.id,
  });

  const recipients = await getRecipientEmails("ARRIVAL");
  if (recipients.length > 0) {
    try {
      await sendEmail({
        fromEmail: process.env.MAIL_SENDER!,
        toAddresses: recipients,
        subject: "Unidad ingresó a planta",
        bodyHtml: `
          <p><strong>Folio:</strong> ${window.id}</p>
          <p><strong>Operador:</strong> ${window.operatorName}</p>
          <p><strong>Placas:</strong> ${window.licensePlate}</p>
          <p><strong>Tipo de operación:</strong> ${WINDOW_TYPE_LABEL[window.type]}</p>
          <p><strong>Hora de llegada:</strong> ${format(actualArrival, "dd/MM/yyyy HH:mm")}</p>
        `,
      });
    } catch (err) {
      console.error("No se pudo enviar el correo de llegada:", err);
    }
  } else {
    await logActivity({
      userId: user.id,
      action: "NOTIFY_SKIPPED",
      entity: "Window",
      entityId: window.id,
      detail: "Sin destinatarios configurados para el evento Llegada a planta",
    });
  }

  return Response.json(window);
}
```

- [ ] **Step 2: Verify types**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/routes/api/windows.\$id.arrive.ts
git commit -m "feat: send arrival email to configurable recipient list"
```

---

### Task 6: Correos de retraso usan la lista de destinatarios configurable

**Files:**
- Modify: `app/lib/delayEscalation.server.ts`

**Interfaces:**
- Consumes: `getRecipientEmails`, `delayMinutesToEvent` from Task 2.

- [ ] **Step 1: Replace the recipient logic**

Full replacement of `app/lib/delayEscalation.server.ts`:

```ts
import { prisma } from "~/lib/db.server";
import { sendEmail } from "~/services/email.server";
import { WINDOW_TYPE_LABEL } from "~/lib/windowStatus";
import { format } from "date-fns";
import { DELAY_THRESHOLDS_MINUTES, getDelayThresholdToNotify } from "./delayThresholds";
import { getRecipientEmails, delayMinutesToEvent } from "./notificationRecipients.server";

const CHECK_INTERVAL_MS = 60_000;
const MIN_THRESHOLD_MINUTES = DELAY_THRESHOLDS_MINUTES[0];

declare global {
  var __delayEscalationStarted: boolean | undefined;
}

export function startDelayEscalationWorker(): void {
  if (globalThis.__delayEscalationStarted) return;
  globalThis.__delayEscalationStarted = true;
  setInterval(() => {
    checkDelays().catch((err) => console.error("Error revisando retrasos:", err));
  }, CHECK_INTERVAL_MS);
}

export async function checkDelays(): Promise<void> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - MIN_THRESHOLD_MINUTES * 60_000);

  const overdue = await prisma.window.findMany({
    where: { status: "SCHEDULED", scheduledStart: { lte: cutoff } },
    include: { client: true, warehouse: true },
  });

  for (const window of overdue) {
    const elapsedMinutes = (now.getTime() - window.scheduledStart.getTime()) / 60_000;
    const threshold = getDelayThresholdToNotify(elapsedMinutes, window.lastDelayNotifiedMinutes);
    if (threshold === null) continue;

    await prisma.window.update({
      where: { id: window.id },
      data: { lastDelayNotifiedMinutes: threshold },
    });

    await prisma.activityLog.create({
      data: {
        userId: 0,
        action: "DELAY_NOTIFY",
        entity: "Window",
        entityId: window.id,
        detail: `Aviso de ${threshold} minutos de retraso`,
      },
    });

    const event = delayMinutesToEvent(threshold as 15 | 30 | 45 | 60);
    const recipients = await getRecipientEmails(event);
    if (recipients.length > 0) {
      try {
        await sendEmail({
          fromEmail: process.env.MAIL_SENDER!,
          toAddresses: recipients,
          subject: `Unidad con ${threshold} minutos de retraso`,
          bodyHtml: `
            <p><strong>Folio:</strong> ${window.id}</p>
            <p><strong>Cliente:</strong> ${window.client.name}</p>
            <p><strong>Operador:</strong> ${window.operatorName}</p>
            <p><strong>Placas:</strong> ${window.licensePlate}</p>
            <p><strong>Nave:</strong> ${window.warehouse.name}</p>
            <p><strong>Tipo de operación:</strong> ${WINDOW_TYPE_LABEL[window.type]}</p>
            <p><strong>Hora programada:</strong> ${format(window.scheduledStart, "dd/MM/yyyy HH:mm")}</p>
            <p><strong>Minutos de retraso:</strong> ${threshold}</p>
          `,
        });
      } catch (err) {
        console.error("No se pudo enviar el correo de retraso:", err);
      }
    } else {
      await prisma.activityLog.create({
        data: {
          userId: 0,
          action: "NOTIFY_SKIPPED",
          entity: "Window",
          entityId: window.id,
          detail: `Sin destinatarios configurados para el evento ${event}`,
        },
      });
    }
  }
}
```

- [ ] **Step 2: Verify types and existing tests**

Run: `npm run typecheck && npm test`
Expected: no errors, all suites pass (this file has no dedicated unit test — `delayThresholds.test.ts` covers the pure threshold logic it depends on and is unaffected).

- [ ] **Step 3: Commit**

```bash
git add app/lib/delayEscalation.server.ts
git commit -m "feat: send delay escalation emails to configurable recipient list"
```

---

### Task 7: Componente compartido `CrudFormDialog` + refactor de `tiers.tsx`

**Files:**
- Create: `app/components/admin/CrudFormDialog.tsx`
- Modify: `app/routes/admin/tiers.tsx`

**Interfaces:**
- Produces: `CrudFormDialog({ trigger?, title, open, onOpenChange, onSave, saveDisabled?, children })` — wraps `Dialog`/`DialogTrigger`/`DialogContent`/`DialogHeader`/`DialogTitle` plus a Guardar/Cancelar footer with a `saving` spinner-disable state.

- [ ] **Step 1: Create `app/components/admin/CrudFormDialog.tsx`**

```tsx
import { useState, type ReactNode } from "react";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";

export function CrudFormDialog({
  trigger,
  title,
  open,
  onOpenChange,
  onSave,
  saveDisabled = false,
  children,
}: {
  trigger?: ReactNode;
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: () => void | Promise<void>;
  saveDisabled?: boolean;
  children: ReactNode;
}) {
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await onSave();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {children}
          <div className="flex gap-2 pt-1">
            <Button onClick={handleSave} disabled={saveDisabled || saving}>
              Guardar
            </Button>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Refactor `app/routes/admin/tiers.tsx` to use it**

Replace the imports (drop `Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger` from `~/components/ui/dialog`, add):

```ts
import { CrudFormDialog } from "~/components/admin/CrudFormDialog";
```

Keep `Dialog, DialogContent, DialogHeader, DialogTitle` imports only for the delete-confirmation dialog (which stays a plain `Dialog` since it has no form fields to save) — remove `DialogTrigger` from that import list since it's no longer used directly (the create trigger now goes through `CrudFormDialog`'s `trigger` prop).

Replace the create dialog block (current lines 106-134):

```tsx
          <CrudFormDialog
            trigger={<Button>Nuevo tier</Button>}
            title="Nuevo tier"
            open={createOpen}
            onOpenChange={setCreateOpen}
            onSave={handleCreate}
            saveDisabled={!name || !priority}
          >
            <div className="space-y-1">
              <Label htmlFor="name">Nombre</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="priority">Prioridad (1 = mayor)</Label>
              <Input id="priority" type="number" value={priority} onChange={(e) => setPriority(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="description">Descripción</Label>
              <Input id="description" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
          </CrudFormDialog>
```

`handleCreate` (current lines 61-72) no longer needs to close the dialog itself since `onSave` runs inside `CrudFormDialog`'s own save handler, but it still should on success — keep the existing `setCreateOpen(false)` call inside `handleCreate`, that still works identically since `CrudFormDialog` just calls the same `onSave` prop.

Replace the edit dialog block (current lines 138-162):

```tsx
      <CrudFormDialog
        title="Editar tier"
        open={!!editTarget}
        onOpenChange={(o) => !o && setEditTarget(null)}
        onSave={handleEdit}
        saveDisabled={!editName || !editPriority}
      >
        <div className="space-y-1">
          <Label htmlFor="editName">Nombre</Label>
          <Input id="editName" value={editName} onChange={(e) => setEditName(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="editPriority">Prioridad (1 = mayor)</Label>
          <Input id="editPriority" type="number" value={editPriority} onChange={(e) => setEditPriority(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="editDescription">Descripción</Label>
          <Input id="editDescription" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} />
        </div>
      </CrudFormDialog>
```

- [ ] **Step 3: Verify types**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, open `/admin/tiers`, create a tier, edit it, delete it — confirm all three flows still work identically to before.

- [ ] **Step 5: Commit**

```bash
git add app/components/admin/CrudFormDialog.tsx app/routes/admin/tiers.tsx
git commit -m "refactor: extract CrudFormDialog and use it in the tiers admin page"
```

---

### Task 8: Refactor `warehouses.tsx` para usar `CrudFormDialog`

**Files:**
- Modify: `app/routes/admin/warehouses.tsx`

**Interfaces:**
- Consumes: `CrudFormDialog` from Task 7.

- [ ] **Step 1: Replace the create dialog block** (current lines 98-121)

```tsx
          <CrudFormDialog
            trigger={<Button>Nueva nave</Button>}
            title="Nueva nave"
            open={createOpen}
            onOpenChange={setCreateOpen}
            onSave={handleCreate}
            saveDisabled={!name || !code}
          >
            <div className="space-y-1">
              <Label htmlFor="name">Nombre</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="code">Código</Label>
              <Input id="code" value={code} onChange={(e) => setCode(e.target.value)} />
            </div>
          </CrudFormDialog>
```

- [ ] **Step 2: Replace the edit dialog block** (current lines 126-146)

```tsx
      <CrudFormDialog
        title="Editar nave"
        open={!!editTarget}
        onOpenChange={(o) => !o && setEditTarget(null)}
        onSave={handleEdit}
        saveDisabled={!editName || !editCode}
      >
        <div className="space-y-1">
          <Label htmlFor="editName">Nombre</Label>
          <Input id="editName" value={editName} onChange={(e) => setEditName(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="editCode">Código</Label>
          <Input id="editCode" value={editCode} onChange={(e) => setEditCode(e.target.value)} />
        </div>
      </CrudFormDialog>
```

- [ ] **Step 3: Update imports**

Replace `import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "~/components/ui/dialog";` (current lines 17-23) with `import { CrudFormDialog } from "~/components/admin/CrudFormDialog";`.

- [ ] **Step 4: Verify types**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Manual verification**

Run: `npm run dev`, open `/admin/warehouses`, create/edit/toggle-active a warehouse — confirm parity with prior behavior.

- [ ] **Step 6: Commit**

```bash
git add app/routes/admin/warehouses.tsx
git commit -m "refactor: use CrudFormDialog in the warehouses admin page"
```

---

### Task 9: Página de admin — Motivos de retraso

**Files:**
- Create: `app/routes/api/delay-reasons.ts`
- Create: `app/routes/admin/delay-reasons.tsx`
- Modify: `app/routes.ts`

**Interfaces:**
- Consumes: `CrudFormDialog` from Task 7, `DelayReason` Prisma model from Task 1.
- Produces: `GET/POST/PATCH /api/delay-reasons`.

- [ ] **Step 1: Create `app/routes/api/delay-reasons.ts`**

```ts
import type { Route } from "./+types/delay-reasons";
import { requireUser } from "~/lib/session.server";
import { prisma } from "~/lib/db.server";

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request);
  const reasons = await prisma.delayReason.findMany({ orderBy: { label: "asc" } });
  return Response.json(reasons);
}

export async function action({ request }: Route.ActionArgs) {
  await requireUser(request, ["ADMINISTRADOR"]);
  const body = await request.json();

  if (request.method === "PATCH") {
    const reason = await prisma.delayReason.update({
      where: { id: body.id },
      data: {
        label: body.label ?? undefined,
        active: body.active ?? undefined,
      },
    });
    return Response.json(reason);
  }

  const reason = await prisma.delayReason.create({ data: { label: body.label } });
  return Response.json(reason, { status: 201 });
}
```

- [ ] **Step 2: Register the routes in `app/routes.ts`**

Add inside the `admin/layout.tsx` children array (after the `admin/warehouses` line, current line 17):

```ts
      route("admin/delay-reasons", "./routes/admin/delay-reasons.tsx"),
```

Add to the top-level `api/*` routes (after `route("api/warehouses", ...)`, current line 33):

```ts
  route("api/delay-reasons", "./routes/api/delay-reasons.ts"),
```

- [ ] **Step 3: Create `app/routes/admin/delay-reasons.tsx`**

```tsx
import { useState } from "react";
import { useNavigate } from "react-router";
import type { Route } from "./+types/delay-reasons";
import { requireUser } from "~/lib/session.server";
import { prisma } from "~/lib/db.server";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { Badge } from "~/components/ui/badge";
import { PageHeader } from "~/components/layout/PageHeader";
import { EmptyState } from "~/components/layout/EmptyState";
import { TableCard } from "~/components/layout/TableCard";
import { Card, CardContent } from "~/components/ui/card";
import { CrudFormDialog } from "~/components/admin/CrudFormDialog";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import type { DelayReason } from "@prisma/client";

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request, ["ADMINISTRADOR"]);
  const reasons = await prisma.delayReason.findMany({ orderBy: { label: "asc" } });
  return { reasons };
}

export default function DelayReasonsAdmin({ loaderData }: Route.ComponentProps) {
  const { reasons } = loaderData;
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<DelayReason | null>(null);
  const [label, setLabel] = useState("");
  const [editLabel, setEditLabel] = useState("");

  function openEdit(r: DelayReason) {
    setEditTarget(r);
    setEditLabel(r.label);
  }

  async function handleCreate() {
    const res = await fetch("/api/delay-reasons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label }),
    });
    if (!res.ok) { toast.error("No se pudo crear el motivo"); return; }
    toast.success("Motivo creado");
    setCreateOpen(false);
    setLabel("");
    navigate(".", { replace: true });
  }

  async function handleEdit() {
    if (!editTarget) return;
    const res = await fetch("/api/delay-reasons", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editTarget.id, label: editLabel }),
    });
    if (!res.ok) { toast.error("No se pudo actualizar el motivo"); return; }
    toast.success("Motivo actualizado");
    setEditTarget(null);
    navigate(".", { replace: true });
  }

  async function toggleActive(r: DelayReason) {
    const res = await fetch("/api/delay-reasons", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: r.id, active: !r.active }),
    });
    if (!res.ok) { toast.error("No se pudo actualizar el motivo"); return; }
    navigate(".", { replace: true });
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Motivos de retraso"
        description="Catálogo de causas usado al completar una ventana con retraso."
        action={
          <CrudFormDialog
            trigger={<Button>Nuevo motivo</Button>}
            title="Nuevo motivo"
            open={createOpen}
            onOpenChange={setCreateOpen}
            onSave={handleCreate}
            saveDisabled={!label}
          >
            <div className="space-y-1">
              <Label htmlFor="label">Motivo</Label>
              <Input id="label" value={label} onChange={(e) => setLabel(e.target.value)} />
            </div>
          </CrudFormDialog>
        }
      />

      <CrudFormDialog
        title="Editar motivo"
        open={!!editTarget}
        onOpenChange={(o) => !o && setEditTarget(null)}
        onSave={handleEdit}
        saveDisabled={!editLabel}
      >
        <div className="space-y-1">
          <Label htmlFor="editLabel">Motivo</Label>
          <Input id="editLabel" value={editLabel} onChange={(e) => setEditLabel(e.target.value)} />
        </div>
      </CrudFormDialog>

      {reasons.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState message="No hay motivos configurados todavía." icon={AlertTriangle} />
          </CardContent>
        </Card>
      ) : (
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Motivo</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="pr-4"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reasons.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="pl-4 font-medium">{r.label}</TableCell>
                  <TableCell>
                    <Badge variant={r.active ? "success" : "secondary"}>
                      {r.active ? "Activo" : "Inactivo"}
                    </Badge>
                  </TableCell>
                  <TableCell className="pr-4">
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => openEdit(r)}>
                        Editar
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => toggleActive(r)}>
                        {r.active ? "Desactivar" : "Activar"}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableCard>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Verify types**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Manual verification**

Run: `npm run dev`, open `/admin/delay-reasons`, create/edit/deactivate a reason, then confirm the deactivated reason no longer appears in the "Completar ventana" dropdown from Task 1 (only `active: true` reasons load there).

- [ ] **Step 6: Commit**

```bash
git add app/routes/api/delay-reasons.ts app/routes/admin/delay-reasons.tsx app/routes.ts
git commit -m "feat: add admin page to manage the delay reason catalog"
```

---

### Task 10: Página de admin — Destinatarios de notificación

**Files:**
- Create: `app/routes/api/notification-recipients.ts`
- Create: `app/routes/admin/notifications.tsx`
- Modify: `app/routes.ts`

**Interfaces:**
- Consumes: `CrudFormDialog` from Task 7, `NotificationRecipient` model + `NOTIFICATION_EVENTS`/`NOTIFICATION_EVENT_LABEL` from Task 2.
- Produces: `GET/POST/PATCH/DELETE /api/notification-recipients`.

- [ ] **Step 1: Create `app/routes/api/notification-recipients.ts`**

```ts
import type { Route } from "./+types/notification-recipients";
import { requireUser } from "~/lib/session.server";
import { prisma } from "~/lib/db.server";

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request, ["ADMINISTRADOR"]);
  const recipients = await prisma.notificationRecipient.findMany({
    orderBy: [{ event: "asc" }, { email: "asc" }],
  });
  return Response.json(recipients);
}

export async function action({ request }: Route.ActionArgs) {
  await requireUser(request, ["ADMINISTRADOR"]);
  const body = await request.json();

  if (request.method === "PATCH") {
    const recipient = await prisma.notificationRecipient.update({
      where: { id: body.id },
      data: { active: body.active ?? undefined },
    });
    return Response.json(recipient);
  }

  if (request.method === "DELETE") {
    await prisma.notificationRecipient.delete({ where: { id: body.id } });
    return Response.json({ ok: true });
  }

  const recipient = await prisma.notificationRecipient.create({
    data: { event: body.event, email: body.email },
  });
  return Response.json(recipient, { status: 201 });
}
```

- [ ] **Step 2: Register the routes in `app/routes.ts`**

Add inside the `admin/layout.tsx` children array (after the `admin/delay-reasons` line added in Task 9):

```ts
      route("admin/notifications", "./routes/admin/notifications.tsx"),
```

Add to the top-level `api/*` routes (after `route("api/delay-reasons", ...)` added in Task 9):

```ts
  route("api/notification-recipients", "./routes/api/notification-recipients.ts"),
```

- [ ] **Step 3: Create `app/routes/admin/notifications.tsx`**

```tsx
import { useState } from "react";
import { useNavigate } from "react-router";
import type { Route } from "./+types/notifications";
import { requireUser } from "~/lib/session.server";
import { prisma } from "~/lib/db.server";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { Badge } from "~/components/ui/badge";
import { PageHeader } from "~/components/layout/PageHeader";
import { EmptyState } from "~/components/layout/EmptyState";
import { TableCard } from "~/components/layout/TableCard";
import { Card, CardContent } from "~/components/ui/card";
import { CrudFormDialog } from "~/components/admin/CrudFormDialog";
import { Mail } from "lucide-react";
import { toast } from "sonner";
import type { NotificationRecipient } from "@prisma/client";
import { NOTIFICATION_EVENTS, NOTIFICATION_EVENT_LABEL } from "~/lib/notificationEvents";

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request, ["ADMINISTRADOR"]);
  const recipients = await prisma.notificationRecipient.findMany({
    orderBy: [{ event: "asc" }, { email: "asc" }],
  });
  return { recipients };
}

export default function NotificationsAdmin({ loaderData }: Route.ComponentProps) {
  const { recipients } = loaderData;
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const [event, setEvent] = useState<string>(NOTIFICATION_EVENTS[0]);
  const [email, setEmail] = useState("");

  async function handleCreate() {
    const res = await fetch("/api/notification-recipients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, email }),
    });
    if (!res.ok) { toast.error("No se pudo agregar el destinatario"); return; }
    toast.success("Destinatario agregado");
    setCreateOpen(false);
    setEmail("");
    navigate(".", { replace: true });
  }

  async function toggleActive(r: NotificationRecipient) {
    const res = await fetch("/api/notification-recipients", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: r.id, active: !r.active }),
    });
    if (!res.ok) { toast.error("No se pudo actualizar el destinatario"); return; }
    navigate(".", { replace: true });
  }

  async function handleDelete(r: NotificationRecipient) {
    const res = await fetch("/api/notification-recipients", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: r.id }),
    });
    if (!res.ok) { toast.error("No se pudo eliminar el destinatario"); return; }
    toast.success("Destinatario eliminado");
    navigate(".", { replace: true });
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Destinatarios de notificación"
        description="Correos que reciben cada aviso automático (llegada, retrasos)."
        action={
          <CrudFormDialog
            trigger={<Button>Nuevo destinatario</Button>}
            title="Nuevo destinatario"
            open={createOpen}
            onOpenChange={setCreateOpen}
            onSave={handleCreate}
            saveDisabled={!email}
          >
            <div className="space-y-1">
              <Label>Evento</Label>
              <Select value={event} onValueChange={setEvent}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NOTIFICATION_EVENTS.map((e) => (
                    <SelectItem key={e} value={e}>{NOTIFICATION_EVENT_LABEL[e]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="email">Correo</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </CrudFormDialog>
        }
      />

      {recipients.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState message="No hay destinatarios configurados todavía." icon={Mail} />
          </CardContent>
        </Card>
      ) : (
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Evento</TableHead>
                <TableHead>Correo</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="pr-4"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recipients.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="pl-4 font-medium">{NOTIFICATION_EVENT_LABEL[r.event]}</TableCell>
                  <TableCell className="text-muted-foreground">{r.email}</TableCell>
                  <TableCell>
                    <Badge variant={r.active ? "success" : "secondary"}>
                      {r.active ? "Activo" : "Inactivo"}
                    </Badge>
                  </TableCell>
                  <TableCell className="pr-4">
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => toggleActive(r)}>
                        {r.active ? "Desactivar" : "Activar"}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(r)}>
                        Eliminar
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableCard>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Verify types**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Manual verification**

Run: `npm run dev`, open `/admin/notifications`, add an email for "Llegada a planta", then confirm a QR arrival now emails that address (see Task 5).

- [ ] **Step 6: Commit**

```bash
git add app/routes/api/notification-recipients.ts app/routes/admin/notifications.tsx app/routes.ts
git commit -m "feat: add admin page to manage notification recipients"
```

---

### Task 11: Navegación agrupada del admin

**Files:**
- Modify: `app/components/layout/AppSidebar.tsx`

**Interfaces:**
- Consumes: routes registered in Tasks 9 and 10 (`/admin/delay-reasons`, `/admin/notifications`).

- [ ] **Step 1: Replace the `adminItems` array and admin `SidebarGroup` block**

Replace the single `adminItems` array (current lines 39-46) with four grouped arrays:

```ts
const catalogItems: NavItem[] = [
  { to: "/admin/clients", label: "Clientes", icon: Users },
  { to: "/admin/tiers", label: "Tiers", icon: LayoutGrid },
  { to: "/admin/warehouses", label: "Naves", icon: Warehouse },
  { to: "/admin/delay-reasons", label: "Motivos de retraso", icon: AlertTriangle },
];

const notificationItems: NavItem[] = [
  { to: "/admin/notifications", label: "Destinatarios", icon: Mail },
];

const userItems: NavItem[] = [
  { to: "/admin/users", label: "Usuarios", icon: ShieldCheck },
];

const operationAdminItems: NavItem[] = [
  { to: "/admin/overrides", label: "Excepciones", icon: ClipboardList },
  { to: "/admin/activity", label: "Actividad", icon: History },
  { to: "/reports", label: "Reportes", icon: LayoutGrid },
];
```

Add `AlertTriangle` and `Mail` to the `lucide-react` import (current lines 2-11):

```ts
import {
  AlertTriangle,
  CalendarRange,
  ClipboardList,
  History,
  Home,
  LayoutGrid,
  Mail,
  ShieldCheck,
  Users,
  Warehouse,
} from "lucide-react";
```

Replace the admin `SidebarGroup` block (current lines 97-115):

```tsx
        {role === "ADMINISTRADOR" && (
          <>
            <SidebarSeparator />
            <SidebarGroup>
              <SidebarGroupLabel>Catálogos</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {catalogItems.map((item) => (
                    <NavLinkItem key={item.to} item={item} pathname={pathname} />
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
            <SidebarGroup>
              <SidebarGroupLabel>Notificaciones</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {notificationItems.map((item) => (
                    <NavLinkItem key={item.to} item={item} pathname={pathname} />
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
            <SidebarGroup>
              <SidebarGroupLabel>Usuarios y accesos</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {userItems.map((item) => (
                    <NavLinkItem key={item.to} item={item} pathname={pathname} />
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
            <SidebarGroup>
              <SidebarGroupLabel>Operación</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {operationAdminItems.map((item) => (
                    <NavLinkItem key={item.to} item={item} pathname={pathname} />
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}
```

- [ ] **Step 2: Verify types**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Manual verification**

Run: `npm run dev`, log in as ADMINISTRADOR, confirm the sidebar shows 4 grouped sections (Catálogos, Notificaciones, Usuarios y accesos, Operación) with all 9 admin links present and none duplicated or missing.

- [ ] **Step 4: Commit**

```bash
git add app/components/layout/AppSidebar.tsx
git commit -m "feat: group admin sidebar navigation by category"
```

---

### Task 12: Actividad — búsqueda y paginación

**Files:**
- Modify: `app/routes/admin/activity.tsx`

**Interfaces:**
- Produces: query params `?page=N&search=text` on `/admin/activity`, 50 rows per page.

- [ ] **Step 1: Rewrite `app/routes/admin/activity.tsx`**

```tsx
import { useState } from "react";
import { Form, useNavigation, useSearchParams } from "react-router";
import type { Route } from "./+types/activity";
import { requireUser } from "~/lib/session.server";
import { prisma } from "~/lib/db.server";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";
import { format } from "date-fns";
import { PageHeader } from "~/components/layout/PageHeader";
import { EmptyState } from "~/components/layout/EmptyState";
import { TableCard } from "~/components/layout/TableCard";
import { Card, CardContent } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { History } from "lucide-react";

const PAGE_SIZE = 50;

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request, ["ADMINISTRADOR"]);
  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));
  const search = url.searchParams.get("search")?.trim() ?? "";

  const where = search
    ? {
        OR: [
          { action: { contains: search, mode: "insensitive" as const } },
          { entity: { contains: search, mode: "insensitive" as const } },
          { detail: { contains: search, mode: "insensitive" as const } },
        ],
      }
    : {};

  const [logs, total] = await Promise.all([
    prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.activityLog.count({ where }),
  ]);

  const userIds = [...new Set(logs.map((l) => l.userId))];
  const users = await prisma.user.findMany({ where: { id: { in: userIds } } });
  const userMap = new Map(users.map((u) => [u.id, u.name]));

  return {
    logs: logs.map((l) => ({ ...l, userName: userMap.get(l.userId) ?? `Usuario ${l.userId}` })),
    page,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    search,
  };
}

export default function ActivityAdmin({ loaderData }: Route.ComponentProps) {
  const { logs, page, totalPages, search } = loaderData;
  const [searchParams] = useSearchParams();
  const navigation = useNavigation();
  const [searchInput, setSearchInput] = useState(search);

  function pageUrl(p: number) {
    const params = new URLSearchParams(searchParams);
    params.set("page", String(p));
    return `?${params.toString()}`;
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Historial de actividad"
        description={`Página ${page} de ${totalPages}.`}
        action={
          <Form method="get" className="flex gap-2">
            <Input
              name="search"
              placeholder="Buscar por acción, entidad o detalle..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-64"
            />
            <Button type="submit" variant="outline" disabled={navigation.state === "loading"}>
              Buscar
            </Button>
          </Form>
        }
      />
      {logs.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState message="No hay actividad registrada todavía." icon={History} />
          </CardContent>
        </Card>
      ) : (
        <>
          <TableCard>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Fecha</TableHead>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Acción</TableHead>
                  <TableHead>Entidad</TableHead>
                  <TableHead className="pr-4">Detalle</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="pl-4 text-muted-foreground">
                      {format(new Date(l.createdAt), "dd/MM/yyyy HH:mm")}
                    </TableCell>
                    <TableCell className="font-medium">{l.userName}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{l.action}</Badge>
                    </TableCell>
                    <TableCell>{l.entity}</TableCell>
                    <TableCell className="pr-4 text-muted-foreground">{l.detail}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableCard>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} asChild={page > 1}>
              {page > 1 ? <a href={pageUrl(page - 1)}>Anterior</a> : <span>Anterior</span>}
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} asChild={page < totalPages}>
              {page < totalPages ? <a href={pageUrl(page + 1)}>Siguiente</a> : <span>Siguiente</span>}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify types**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Manual verification**

Run: `npm run dev`, open `/admin/activity`, confirm it shows at most 50 rows, that typing in the search box and clicking "Buscar" filters by action/entity/detail, and that "Siguiente"/"Anterior" page through results.

- [ ] **Step 4: Commit**

```bash
git add app/routes/admin/activity.tsx
git commit -m "feat: add search and pagination to the activity log admin page"
```

---

### Task 13: Quitar auto-registro, backfill de nombre y pantalla de acceso denegado

**Files:**
- Modify: `app/services/auth-server.ts`
- Modify: `app/routes/auth/callback.tsx`
- Modify: `app/routes/auth/login.tsx`

**Interfaces:**
- Produces: `findRegisteredUser(email: string): Promise<User | null>` (replaces `findOrCreateUser`).

- [ ] **Step 1: Rewrite `app/services/auth-server.ts`**

```ts
import { prisma } from "~/lib/db.server";

export async function findRegisteredUser(email: string) {
  return prisma.user.findUnique({ where: { email } });
}
```

- [ ] **Step 2: Rewrite `app/routes/auth/callback.tsx`**

```tsx
import { redirect } from "react-router";

import type { Route } from "./+types/callback";

import { msalClient, REDIRECT_URI } from "~/lib/microsoft.server";

import { createUserSession } from "~/lib/session.server";
import { prisma } from "~/lib/db.server";

import { findRegisteredUser } from "~/services/auth-server";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  if (!code) {
    throw redirect("/login");
  }

  const response = await msalClient.acquireTokenByCode({
    code,
    scopes: ["User.Read"],
    redirectUri: REDIRECT_URI,
  });

  const email = response.account?.username;

  if (!email) {
    throw redirect("/login");
  }

  const user = await findRegisteredUser(email);

  if (!user) {
    throw redirect("/login?error=not_registered");
  }

  if (!user.name && response.accessToken) {
    try {
      const meRes = await fetch("https://graph.microsoft.com/v1.0/me", {
        headers: { Authorization: `Bearer ${response.accessToken}` },
      });
      if (meRes.ok) {
        const me = await meRes.json();
        if (me.displayName) {
          await prisma.user.update({ where: { id: user.id }, data: { name: me.displayName } });
        }
      }
    } catch (err) {
      console.error("No se pudo obtener displayName de Graph:", err);
    }
  }

  return createUserSession(user.id, "/");
}

export default function CallbackPage() {
  return null;
}
```

- [ ] **Step 3: Add the error message to `app/routes/auth/login.tsx`**

Add a loader and read the search param:

```tsx
import { redirect, Form } from "react-router";
import { Warehouse } from "lucide-react";

import type { Route } from "./+types/login";
import { msalClient, REDIRECT_URI } from "~/lib/microsoft.server";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { AlertTriangle } from "lucide-react";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  return { error };
}

export async function action() {
  const authUrl = await msalClient.getAuthCodeUrl({
    scopes: ["User.Read"],
    redirectUri: REDIRECT_URI,
  });

  return redirect(authUrl);
}

export default function LoginPage({ loaderData }: Route.ComponentProps) {
  const { error } = loaderData;
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Warehouse className="size-5" />
          </div>
          <CardTitle className="mt-2">Ventanas de Embarque</CardTitle>
          <CardDescription>Inicia sesión para continuar</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {error === "not_registered" && (
            <Alert variant="destructive">
              <AlertTriangle className="size-4" />
              <AlertTitle>Cuenta no registrada</AlertTitle>
              <AlertDescription>
                Tu cuenta no está registrada, contacta al administrador.
              </AlertDescription>
            </Alert>
          )}
          <Form method="post">
            <Button type="submit" className="w-full">
              Iniciar sesión con Microsoft
            </Button>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 4: Verify types**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Manual verification**

Run: `npm run dev`. With a test Entra ID account that has no matching `User` row in the DB, complete the Microsoft login flow and confirm it redirects to `/login` showing "Cuenta no registrada" instead of silently creating an account. Then log in with a pre-existing `User` row whose `name` is empty and confirm `name` gets populated after login (check via `/admin/users`).

- [ ] **Step 6: Commit**

```bash
git add app/services/auth-server.ts app/routes/auth/callback.tsx app/routes/auth/login.tsx
git commit -m "feat: require admin-created accounts, block unregistered logins, backfill name from Graph"
```

---

### Task 14: Token de aplicación compartido + búsqueda de directorio Entra ID

**Files:**
- Modify: `app/lib/microsoft.server.ts`
- Modify: `app/services/email.server.ts`
- Create: `app/routes/api/users.search.ts`
- Modify: `app/routes.ts`

**Interfaces:**
- Produces: `getAppAccessToken(): Promise<string>` (moved from `email.server.ts` into `microsoft.server.ts` so both mail-sending and directory search share it).
- Produces: `GET /api/users/search?q=<text>` → `{ results: { name: string; email: string }[], error?: "graph_unavailable" }`.

- [ ] **Step 1: Add `getAppAccessToken` to `app/lib/microsoft.server.ts`**

Append to the end of the file:

```ts
export async function getAppAccessToken(): Promise<string> {
  const result = await msalClient.acquireTokenByClientCredential({
    scopes: ["https://graph.microsoft.com/.default"],
  });
  if (!result?.accessToken) throw new Error("Failed to acquire app access token");
  return result.accessToken;
}
```

- [ ] **Step 2: Update `app/services/email.server.ts` to use it**

Replace the top of the file (current lines 1-9):

```ts
import { getAppAccessToken } from "~/lib/microsoft.server";
```

Remove the now-duplicate local `getAppAccessToken` function definition (was current lines 3-9) — the rest of the file (`sendEmail`) is unchanged since it already calls `getAppAccessToken()`.

- [ ] **Step 3: Create `app/routes/api/users.search.ts`**

```ts
import type { Route } from "./+types/users.search";
import { requireUser } from "~/lib/session.server";
import { getAppAccessToken } from "~/lib/microsoft.server";

interface GraphUser {
  displayName?: string;
  mail?: string;
  userPrincipalName?: string;
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request, ["ADMINISTRADOR"]);
  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim();
  if (!q || q.length < 2) return Response.json({ results: [] });

  let token: string;
  try {
    token = await getAppAccessToken();
  } catch (err) {
    console.error("No se pudo obtener token de aplicación para Graph:", err);
    return Response.json({ results: [], error: "graph_unavailable" });
  }

  const search = encodeURIComponent(`"displayName:${q}" OR "mail:${q}"`);
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users?$search=${search}&$select=displayName,mail,userPrincipalName&$top=10`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        ConsistencyLevel: "eventual",
      },
    }
  );

  if (!res.ok) {
    console.error("Graph user search failed:", res.status, await res.text());
    return Response.json({ results: [], error: "graph_unavailable" });
  }

  const data = (await res.json()) as { value?: GraphUser[] };
  const results = (data.value ?? [])
    .map((u) => ({ name: u.displayName ?? "", email: u.mail ?? u.userPrincipalName ?? "" }))
    .filter((u) => u.email);

  return Response.json({ results });
}
```

- [ ] **Step 4: Register the route in `app/routes.ts`**

Add to the top-level `api/*` routes (after `route("api/users", ...)`, current line 36):

```ts
  route("api/users/search", "./routes/api/users.search.ts"),
```

- [ ] **Step 5: Verify types**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Document the required Azure permission**

Add a comment above the `msalClient` export in `app/lib/microsoft.server.ts` (this is documentation, not a placeholder — it records an operational prerequisite that has no code representation):

```ts
// Requires the Microsoft Graph application permission "User.Read.All"
// (or "People.Read.All") with admin consent granted in Azure AD, in
// addition to the existing "Mail.Send" application permission, for
// GET /api/users/search (app/routes/api/users.search.ts) to work.
```

Place it directly above `export const msalClient = new ConfidentialClientApplication(msalConfig);`.

- [ ] **Step 7: Manual verification**

After granting `User.Read.All` application permission with admin consent in the Azure portal for the app registration referenced by `MICROSOFT_CLIENT_ID`, run: `npm run dev`, then `curl "http://localhost:3000/api/users/search?q=an"` while logged in as ADMINISTRADOR (via browser cookie, or temporarily call the loader from `/admin/users` in Task 15) and confirm it returns directory matches. If the permission has not been granted yet, confirm the endpoint returns `{ "results": [], "error": "graph_unavailable" }` instead of throwing a 500.

- [ ] **Step 8: Commit**

```bash
git add app/lib/microsoft.server.ts app/services/email.server.ts app/routes/api/users.search.ts app/routes.ts
git commit -m "feat: add Microsoft Graph directory search endpoint for admin user creation"
```

---

### Task 15: Alta de usuario — `CrudFormDialog` + búsqueda Entra ID con fallback manual

**Files:**
- Create: `app/components/admin/UserSearchCombobox.tsx`
- Modify: `app/routes/admin/users.tsx`

**Interfaces:**
- Consumes: `CrudFormDialog` from Task 7, `GET /api/users/search` from Task 14.
- Produces: `UserSearchCombobox({ onSelect: (user: { name: string; email: string }) => void })`.

- [ ] **Step 1: Create `app/components/admin/UserSearchCombobox.tsx`**

```tsx
import { useEffect, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { Input } from "~/components/ui/input";

interface DirectoryUser {
  name: string;
  email: string;
}

export function UserSearchCombobox({
  onSelect,
}: {
  onSelect: (user: DirectoryUser) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DirectoryUser[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        setResults(data.results ?? []);
        setUnavailable(data.error === "graph_unavailable");
        setOpen(true);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Input
          placeholder="Buscar por nombre o correo en el directorio..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </PopoverTrigger>
      <PopoverContent className="w-80 p-1" onOpenAutoFocus={(e) => e.preventDefault()}>
        {loading && <p className="px-2 py-1.5 text-sm text-muted-foreground">Buscando...</p>}
        {!loading && unavailable && (
          <p className="px-2 py-1.5 text-sm text-muted-foreground">
            No se pudo consultar el directorio. Ingresa los datos manualmente.
          </p>
        )}
        {!loading && !unavailable && results.length === 0 && (
          <p className="px-2 py-1.5 text-sm text-muted-foreground">Sin resultados.</p>
        )}
        {!loading &&
          results.map((u) => (
            <button
              key={u.email}
              type="button"
              className="block w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
              onClick={() => {
                onSelect(u);
                setOpen(false);
              }}
            >
              <span className="font-medium">{u.name}</span>
              <span className="block text-xs text-muted-foreground">{u.email}</span>
            </button>
          ))}
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 2: Rewrite `app/routes/admin/users.tsx`**

Full replacement:

```tsx
import { useState } from "react";
import { useNavigate } from "react-router";
import type { Route } from "./+types/users";
import { requireUser } from "~/lib/session.server";
import { prisma } from "~/lib/db.server";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { Badge } from "~/components/ui/badge";
import { PageHeader } from "~/components/layout/PageHeader";
import { EmptyState } from "~/components/layout/EmptyState";
import { TableCard } from "~/components/layout/TableCard";
import { Card, CardContent } from "~/components/ui/card";
import { CrudFormDialog } from "~/components/admin/CrudFormDialog";
import { UserSearchCombobox } from "~/components/admin/UserSearchCombobox";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import type { User } from "@prisma/client";

const ROLES = ["VENTAS", "CARGA", "DESCARGA", "ADMINISTRADOR"] as const;

const ROLE_LABELS: Record<string, string> = {
  VENTAS: "Ventas",
  CARGA: "Carga",
  DESCARGA: "Descarga",
  ADMINISTRADOR: "Administrador",
};

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request, ["ADMINISTRADOR"]);
  const users = await prisma.user.findMany({ orderBy: { name: "asc" } });
  return { users };
}

export default function UsersAdmin({ loaderData }: Route.ComponentProps) {
  const { users } = loaderData;
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<User | null>(null);

  // Create form state
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<string>("VENTAS");
  const [manualEntry, setManualEntry] = useState(false);

  // Edit form state
  const [editRole, setEditRole] = useState<string>("VENTAS");

  function openEdit(u: User) {
    setEditTarget(u);
    setEditRole(u.role);
  }

  function resetCreateForm() {
    setEmail("");
    setName("");
    setRole("VENTAS");
    setManualEntry(false);
  }

  async function handleCreate() {
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name, role }),
    });
    if (!res.ok) { toast.error("No se pudo crear el usuario"); return; }
    toast.success("Usuario creado");
    setCreateOpen(false);
    resetCreateForm();
    navigate(".", { replace: true });
  }

  async function handleEditSave() {
    if (!editTarget) return;
    const res = await fetch("/api/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editTarget.id, role: editRole }),
    });
    if (!res.ok) { toast.error("No se pudo actualizar el usuario"); return; }
    toast.success("Rol actualizado");
    setEditTarget(null);
    navigate(".", { replace: true });
  }

  async function toggleActive(u: User) {
    const res = await fetch("/api/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: u.id, active: !u.active }),
    });
    if (!res.ok) { toast.error("No se pudo actualizar el usuario"); return; }
    navigate(".", { replace: true });
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Usuarios"
        description="Cuentas con acceso al sistema y su rol asignado. Solo el administrador puede crear cuentas."
        action={
          <CrudFormDialog
            trigger={<Button>Nuevo usuario</Button>}
            title="Nuevo usuario"
            open={createOpen}
            onOpenChange={(o) => { setCreateOpen(o); if (!o) resetCreateForm(); }}
            onSave={handleCreate}
            saveDisabled={!email || !name}
          >
            {!manualEntry ? (
              <div className="space-y-2">
                <Label>Buscar en el directorio</Label>
                <UserSearchCombobox
                  onSelect={(u) => { setName(u.name); setEmail(u.email); }}
                />
                {(name || email) && (
                  <div className="rounded-md border p-2 text-sm">
                    <p className="font-medium">{name}</p>
                    <p className="text-muted-foreground">{email}</p>
                  </div>
                )}
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline"
                  onClick={() => setManualEntry(true)}
                >
                  Ingresar datos manualmente
                </button>
              </div>
            ) : (
              <>
                <div className="space-y-1">
                  <Label htmlFor="email">Correo</Label>
                  <Input id="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="uname">Nombre</Label>
                  <Input id="uname" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline"
                  onClick={() => setManualEntry(false)}
                >
                  Volver a la búsqueda del directorio
                </button>
              </>
            )}
            <div className="space-y-1">
              <Label>Rol</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CrudFormDialog>
        }
      />

      <CrudFormDialog
        title="Editar usuario"
        open={!!editTarget}
        onOpenChange={(o) => !o && setEditTarget(null)}
        onSave={handleEditSave}
      >
        <p className="text-sm text-muted-foreground">
          {editTarget?.name} — {editTarget?.email}
        </p>
        <div className="space-y-1">
          <Label>Rol</Label>
          <Select value={editRole} onValueChange={setEditRole}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLES.map((r) => (
                <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CrudFormDialog>

      {users.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState message="No hay usuarios registrados todavía." icon={ShieldCheck} />
          </CardContent>
        </Card>
      ) : (
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Nombre</TableHead>
                <TableHead>Correo</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="pr-4"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="pl-4 font-medium">{u.name}</TableCell>
                  <TableCell className="text-muted-foreground">{u.email}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{ROLE_LABELS[u.role] ?? u.role}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={u.active ? "success" : "secondary"}>
                      {u.active ? "Activo" : "Inactivo"}
                    </Badge>
                  </TableCell>
                  <TableCell className="pr-4">
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => openEdit(u)}>
                        Editar rol
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => toggleActive(u)}>
                        {u.active ? "Desactivar" : "Activar"}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableCard>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify types**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, open `/admin/users`, click "Nuevo usuario", type at least 2 characters in the directory search box. If `User.Read.All` consent is already granted, confirm real directory matches appear and clicking one fills Correo/Nombre; otherwise confirm the "No se pudo consultar el directorio" message appears and "Ingresar datos manualmente" lets you type Correo/Nombre by hand and still create the user with a Role.

- [ ] **Step 5: Commit**

```bash
git add app/components/admin/UserSearchCombobox.tsx app/routes/admin/users.tsx
git commit -m "feat: create users via Entra ID directory search with manual entry fallback"
```

---

## Self-Review Notes

- **Spec coverage:** Tipo de operación (Task 4) — done. Motivo de retraso catalog + capture (Task 1) — done. Destinatarios configurables para llegada (Task 5) y retrasos (Task 6) — done. Admin nav agrupada (Task 11) + CrudFormDialog compartido (Tasks 7-10) + corrección FK (Task 3) + búsqueda/paginación de actividad (Task 12) — done. Quitar auto-registro + nombre + bloqueo de login (Task 13) — done. Búsqueda Entra ID en alta de usuario con fallback (Tasks 14-15) — done. Fuera de alcance (entidad Transportista, relabeling de reportes, theming) — intentionally not covered, per the design doc.
- **Placeholder scan:** no "TBD"/"handle appropriately" phrasing; every step has literal code or an exact command with expected output.
- **Type consistency:** `DelayReason`/`delayReasonId`/`delayReasonCategory` (relation) naming is consistent across Tasks 1, 9; `NotificationRecipient`/`getRecipientEmails`/`delayMinutesToEvent` consistent across Tasks 2, 5, 6, 10; `CrudFormDialog` prop shape (`trigger, title, open, onOpenChange, onSave, saveDisabled, children`) consistent across Tasks 7-10, 15; `findRegisteredUser` consistent across Task 13; `getAppAccessToken` consistent across Task 14.
