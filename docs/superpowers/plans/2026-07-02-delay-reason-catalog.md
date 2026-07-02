# Catálogo de motivos de retraso Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the free-text `delayReason` field (required today when a window's completion overruns its estimated time) with a fixed `DelayReasonCategory` enum matching the client's listed categories, keeping the free text as an optional extra-detail field.

**Architecture:** Add a Prisma enum + `Window.delayReasonCategory` field, a label map, then update the single write path (`windows.$id.complete.ts`) and every read path that currently treats `delayReason` as a boolean "had a delay" signal (`_root.tsx`, `reports.summary.ts`, `reports.export.ts`) to use `delayReasonCategory` instead. The UI dialog on `/windows/:id` gains a required `<Select>` and keeps its existing `<Textarea>` as an optional detail.

**Tech Stack:** React Router v7, Prisma/PostgreSQL, ShadCN `Select` (already used elsewhere in this codebase, e.g. `app/routes/calendar.tsx`), ExcelJS.

## Global Constraints

- `delayReasonCategory` is the field that becomes required when a window is completed overtime — `delayReason` (free text) becomes optional and no longer gates completion.
- Every place that currently reads `delayReason` as a "did this window have a delay" boolean signal must switch to `delayReasonCategory` instead, because `delayReason` can now be empty even when a delay occurred.
- The catalog is a fixed Prisma enum (`FALTA_MATERIAL_PT`, `RETRASO_OPERACION`, `CAMBIO_REQUERIMIENTO`, `OTRO`) — not an admin-configurable model — matching the client's exact list plus a catch-all.
- No integration/DB test harness exists in this repo — verify the write/read paths manually against a locally reachable Postgres, same pattern as the prior two sub-projects.

---

### Task 1: Prisma schema — `DelayReasonCategory` enum + field

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces: `DelayReasonCategory` enum (`FALTA_MATERIAL_PT | RETRASO_OPERACION | CAMBIO_REQUERIMIENTO | OTRO`), `Window.delayReasonCategory: DelayReasonCategory | null` — consumed by every later task.

- [ ] **Step 1: Add the enum**

In `prisma/schema.prisma`, change:

```prisma
enum WindowType {
  CARGA
  DESCARGA
}
```

to:

```prisma
enum WindowType {
  CARGA
  DESCARGA
}

enum DelayReasonCategory {
  FALTA_MATERIAL_PT
  RETRASO_OPERACION
  CAMBIO_REQUERIMIENTO
  OTRO
}
```

- [ ] **Step 2: Add the field to `Window`**

In the same file, change:

```prisma
  rollsCount      Int?
  delayReason     String?
  lastDelayNotifiedMinutes Int?
  overrideRequest OverrideRequest?
```

to:

```prisma
  rollsCount      Int?
  delayReason     String?
  delayReasonCategory DelayReasonCategory?
  lastDelayNotifiedMinutes Int?
  overrideRequest OverrideRequest?
```

- [ ] **Step 3: Ensure Postgres is reachable, then generate and run the migration**

Run: `docker compose up -d postgres`
Expected: `app-template-postgres` running and healthy.

Run: `DATABASE_URL="postgresql://postgres:1234@localhost:5432/app_template" npx prisma migrate dev --name add_delay_reason_category`
Expected: a new folder under `prisma/migrations/` with `CREATE TYPE "DelayReasonCategory"` and `ALTER TABLE ... ADD COLUMN` SQL, command exits without error.

- [ ] **Step 4: Regenerate the Prisma client and typecheck**

Run: `npx prisma generate && npm run typecheck`
Expected: `✔ Generated Prisma Client`, then zero typecheck errors.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: add DelayReasonCategory enum and Window field"
```

---

### Task 2: Delay reason labels

**Files:**
- Create: `app/lib/delayReasons.ts`

**Interfaces:**
- Produces: `DELAY_REASON_CATEGORY_LABEL: Record<DelayReasonCategory, string>` — consumed by Task 3, Task 4, Task 5.

- [ ] **Step 1: Create the label map**

Create `app/lib/delayReasons.ts`:

```ts
import type { DelayReasonCategory } from "@prisma/client";

export const DELAY_REASON_CATEGORY_LABEL: Record<DelayReasonCategory, string> = {
  FALTA_MATERIAL_PT: "Falta de material en PT",
  RETRASO_OPERACION: "Retrasos por operación",
  CAMBIO_REQUERIMIENTO: "Cambio de requerimiento",
  OTRO: "Otro",
};
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/lib/delayReasons.ts
git commit -m "feat: add delay reason category labels"
```

---

### Task 3: Require `delayReasonCategory` on completion

**Files:**
- Modify: `app/routes/api/windows.$id.complete.ts`

**Interfaces:**
- Consumes: `DELAY_REASON_CATEGORY_LABEL` (`~/lib/delayReasons`, Task 2), `DelayReasonCategory` type (`@prisma/client`).
- Produces: `POST /api/windows/:id/complete` now requires `body.delayReasonCategory` (not `body.delayReason`) when overtime — consumed by Task 4 (`detail.tsx`).

- [ ] **Step 1: Replace the action**

Replace the full contents of `app/routes/api/windows.$id.complete.ts` with:

```ts
import type { Route } from "./+types/windows.$id.complete";
import type { DelayReasonCategory } from "@prisma/client";
import { requireUser } from "~/lib/session.server";
import { prisma } from "~/lib/db.server";
import { logActivity } from "~/lib/activity.server";
import { DELAY_REASON_CATEGORY_LABEL } from "~/lib/delayReasons";

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

  if (actualMinutes > existing.client.avgLoadTime && !body.delayReasonCategory) {
    return Response.json({ error: "delay_reason_required" }, { status: 400 });
  }

  const window = await prisma.window.update({
    where: { id: params.id },
    data: {
      status: "COMPLETED",
      actualEnd,
      rollsCount: Number(body.rollsCount),
      delayReasonCategory: body.delayReasonCategory ?? null,
      delayReason: body.delayReason ?? null,
    },
  });

  await logActivity({
    userId: user.id,
    action: "COMPLETE",
    entity: "Window",
    entityId: window.id,
    detail: body.delayReasonCategory
      ? `Retraso: ${DELAY_REASON_CATEGORY_LABEL[body.delayReasonCategory as DelayReasonCategory]}${body.delayReason ? " — " + body.delayReason : ""}`
      : undefined,
  });

  return Response.json(window);
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "app/routes/api/windows.\$id.complete.ts"
git commit -m "feat: require delayReasonCategory instead of free text on completion"
```

---

### Task 4: `/windows/:id` completion dialog and detail view

**Files:**
- Modify: `app/routes/windows/detail.tsx`

**Interfaces:**
- Consumes: `DELAY_REASON_CATEGORY_LABEL` (`~/lib/delayReasons`, Task 2), the widened `POST /api/windows/:id/complete` contract (Task 3), ShadCN `Select`/`SelectContent`/`SelectItem`/`SelectTrigger`/`SelectValue` (`~/components/ui/select`, already installed and used in `app/routes/calendar.tsx`).

- [ ] **Step 1: Add imports**

In `app/routes/windows/detail.tsx`, change:

```tsx
import { PageHeader } from "~/components/layout/PageHeader";
import { WINDOW_STATUS_BADGE_VARIANT, WINDOW_STATUS_LABEL } from "~/lib/windowStatus";
import { QrCode } from "lucide-react";
```

to:

```tsx
import { PageHeader } from "~/components/layout/PageHeader";
import { WINDOW_STATUS_BADGE_VARIANT, WINDOW_STATUS_LABEL } from "~/lib/windowStatus";
import { DELAY_REASON_CATEGORY_LABEL } from "~/lib/delayReasons";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { QrCode } from "lucide-react";
```

- [ ] **Step 2: Add the category state**

Change:

```tsx
  const [rollsCount, setRollsCount] = useState("");
  const [delayReason, setDelayReason] = useState("");
  const [needsDelayReason, setNeedsDelayReason] = useState(false);
```

to:

```tsx
  const [rollsCount, setRollsCount] = useState("");
  const [delayReasonCategory, setDelayReasonCategory] = useState("");
  const [delayReason, setDelayReason] = useState("");
  const [needsDelayReason, setNeedsDelayReason] = useState(false);
```

- [ ] **Step 3: Send the category in `handleComplete`**

Change:

```tsx
      body: JSON.stringify({ rollsCount, delayReason: delayReason || undefined }),
```

to:

```tsx
      body: JSON.stringify({
        rollsCount,
        delayReasonCategory: delayReasonCategory || undefined,
        delayReason: delayReason || undefined,
      }),
```

- [ ] **Step 4: Show the categorized reason and the free-text detail separately**

Change:

```tsx
            {window.delayReason && (
              <Field label="Motivo de retraso" value={window.delayReason} />
            )}
```

to:

```tsx
            {window.delayReasonCategory && (
              <Field
                label="Motivo de retraso"
                value={DELAY_REASON_CATEGORY_LABEL[window.delayReasonCategory]}
              />
            )}
            {window.delayReason && (
              <Field label="Detalle adicional" value={window.delayReason} />
            )}
```

- [ ] **Step 5: Replace the dialog's reason field with a required Select plus optional detail**

Change:

```tsx
            {needsDelayReason && (
              <div className="space-y-1">
                <Label htmlFor="delayReason">Motivo del retraso</Label>
                <Textarea
                  id="delayReason"
                  value={delayReason}
                  onChange={(e) => setDelayReason(e.target.value)}
                />
              </div>
            )}
            <Button onClick={handleComplete} disabled={!rollsCount}>
              Confirmar
            </Button>
```

to:

```tsx
            {needsDelayReason && (
              <>
                <div className="space-y-1">
                  <Label htmlFor="delayReasonCategory">Motivo del retraso</Label>
                  <Select value={delayReasonCategory} onValueChange={setDelayReasonCategory}>
                    <SelectTrigger id="delayReasonCategory">
                      <SelectValue placeholder="Selecciona un motivo" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(DELAY_REASON_CATEGORY_LABEL).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="delayReason">Detalle adicional (opcional)</Label>
                  <Textarea
                    id="delayReason"
                    value={delayReason}
                    onChange={(e) => setDelayReason(e.target.value)}
                  />
                </div>
              </>
            )}
            <Button
              onClick={handleComplete}
              disabled={!rollsCount || (needsDelayReason && !delayReasonCategory)}
            >
              Confirmar
            </Button>
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add app/routes/windows/detail.tsx
git commit -m "feat: add delay reason category select to completion dialog"
```

---

### Task 5: Switch delay-signal consumers to `delayReasonCategory`

**Files:**
- Modify: `app/routes/_root.tsx:40`
- Modify: `app/routes/api/reports.summary.ts:41`
- Modify: `app/routes/api/reports.export.ts`

**Interfaces:**
- Consumes: `DELAY_REASON_CATEGORY_LABEL` (`~/lib/delayReasons`, Task 2).

- [ ] **Step 1: Dashboard delay count**

In `app/routes/_root.tsx`, change:

```tsx
        prisma.window.count({ where: { scheduledStart: { gte: todayStart, lte: todayEnd }, delayReason: { not: null } } }),
```

to:

```tsx
        prisma.window.count({ where: { scheduledStart: { gte: todayStart, lte: todayEnd }, delayReasonCategory: { not: null } } }),
```

- [ ] **Step 2: Reports summary delay count**

In `app/routes/api/reports.summary.ts`, change:

```ts
    if (w.delayReason) entry.delays += 1;
```

to:

```ts
    if (w.delayReasonCategory) entry.delays += 1;
```

- [ ] **Step 3: Excel export — delay count, detail sheet, and delays sheet**

Replace the full contents of `app/routes/api/reports.export.ts` with:

```ts
import ExcelJS from "exceljs";
import type { Route } from "./+types/reports.export";
import { requireUser } from "~/lib/session.server";
import { prisma } from "~/lib/db.server";
import { DELAY_REASON_CATEGORY_LABEL } from "~/lib/delayReasons";

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request, ["ADMINISTRADOR"]);
  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  const windows = await prisma.window.findMany({
    where: from && to ? { scheduledStart: { gte: new Date(from), lte: new Date(to) } } : {},
    include: { client: true, warehouse: true },
    orderBy: { scheduledStart: "asc" },
  });

  const workbook = new ExcelJS.Workbook();

  const summarySheet = workbook.addWorksheet("Resumen");
  summarySheet.addRow(["Cliente", "Tiempo promedio real (min)", "Tiempo estimado (min)", "Retardos"]);
  const byClient = new Map<string, { actualSum: number; actualCount: number; estimated: number; delays: number }>();
  for (const w of windows) {
    const entry = byClient.get(w.client.name) ?? { actualSum: 0, actualCount: 0, estimated: w.client.avgLoadTime, delays: 0 };
    if (w.actualStart && w.actualEnd) {
      entry.actualSum += (w.actualEnd.getTime() - w.actualStart.getTime()) / 60000;
      entry.actualCount += 1;
    }
    if (w.delayReasonCategory) entry.delays += 1;
    byClient.set(w.client.name, entry);
  }
  for (const [name, v] of byClient) {
    summarySheet.addRow([name, v.actualCount ? Math.round(v.actualSum / v.actualCount) : "", v.estimated, v.delays]);
  }

  const detailSheet = workbook.addWorksheet("Detalle de ventanas");
  detailSheet.addRow([
    "ID", "Cliente", "Nave", "Tipo", "Inicio programado", "Fin programado",
    "Inicio real", "Fin real", "Operador", "Placas", "Rollos", "Estado", "Motivo de retraso", "Detalle",
  ]);
  for (const w of windows) {
    detailSheet.addRow([
      w.id, w.client.name, w.warehouse.name, w.type,
      w.scheduledStart.toISOString(), w.scheduledEnd.toISOString(),
      w.actualStart?.toISOString() ?? "", w.actualEnd?.toISOString() ?? "",
      w.operatorName, w.licensePlate, w.rollsCount ?? "", w.status,
      w.delayReasonCategory ? DELAY_REASON_CATEGORY_LABEL[w.delayReasonCategory] : "",
      w.delayReason ?? "",
    ]);
  }

  const delaysSheet = workbook.addWorksheet("Retardos y motivos");
  delaysSheet.addRow(["Cliente", "Nave", "Fecha", "Motivo", "Detalle"]);
  for (const w of windows.filter((w) => w.delayReasonCategory)) {
    delaysSheet.addRow([
      w.client.name,
      w.warehouse.name,
      w.scheduledStart.toISOString(),
      DELAY_REASON_CATEGORY_LABEL[w.delayReasonCategory!],
      w.delayReason ?? "",
    ]);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": "attachment; filename=reporte-ventanas.xlsx",
    },
  });
}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add app/routes/_root.tsx app/routes/api/reports.summary.ts app/routes/api/reports.export.ts
git commit -m "feat: switch delay-signal consumers to delayReasonCategory"
```

---

### Task 6: End-to-end verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full automated suite**

Run: `npx vitest run && npm run typecheck`
Expected: all existing test files still pass, zero typecheck errors. (This sub-project adds no new
pure-logic unit tests — see the spec's Testing section.)

- [ ] **Step 2: Start a local server against the reachable database**

Run: `docker compose up -d postgres` (if not already running), then:

Run: `DATABASE_URL="postgresql://postgres:1234@localhost:5432/app_template" npx react-router dev --port 5177`
Expected: server logs `Local: http://localhost:5177/`.

- [ ] **Step 3: Mint a session cookie and create + start a window**

In the project root, create a throwaway script `_verify-mint-cookie.ts` (do not commit):

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

Run:
```bash
curl -s -b "<cookie>" "http://localhost:5177/api/clients" | node -pe "JSON.parse(require('fs').readFileSync(0,'utf8'))[0].id"
curl -s -b "<cookie>" "http://localhost:5177/api/warehouses" | node -pe "JSON.parse(require('fs').readFileSync(0,'utf8'))[0].id"
```
Expected: a `clientId` and `warehouseId`. Use them below as `<clientId>`/`<warehouseId>`.

Run:
```bash
curl -s -b "<cookie>" -X POST "http://localhost:5177/api/windows" \
  -H "Content-Type: application/json" \
  -d "{\"clientId\":\"<clientId>\",\"warehouseId\":\"<warehouseId>\",\"scheduledStart\":\"2026-07-03T15:00:00.000Z\",\"operatorName\":\"Verificación Motivo\",\"licensePlate\":\"MOT-001\"}"
```
Expected: `201` with a `window.id` in the body. Call it `<windowId>` below.

Run: `curl -s -b "<cookie>" -X POST "http://localhost:5177/api/windows/<windowId>/start"`
Expected: `200`, `"status":"IN_PROGRESS"`.

- [ ] **Step 4: Backdate `actualStart` so completion is overtime**

Create a throwaway script `_verify-backdate-start.ts` (do not commit), replacing `<windowId>` with
the id from Step 3:

```ts
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const window = await prisma.window.update({
    where: { id: "<windowId>" },
    data: { actualStart: new Date(Date.now() - 2 * 60 * 60_000) },
    include: { client: true },
  });
  console.log("actualStart backdated 2h. avgLoadTime:", window.client.avgLoadTime, "min");
}

main().finally(() => prisma.$disconnect());
```

Run: `DATABASE_URL="postgresql://postgres:1234@localhost:5432/app_template" npx tsx _verify-backdate-start.ts`
Expected: prints the client's `avgLoadTime` (well under 120 minutes for every seeded client), so
completing now will exceed it.

- [ ] **Step 5: Confirm completion is rejected without a category**

Run: `curl -s -w "\nHTTP %{http_code}\n" -b "<cookie>" -X POST "http://localhost:5177/api/windows/<windowId>/complete" -H "Content-Type: application/json" -d "{\"rollsCount\":10}"`
Expected: `HTTP 400` with `{"error":"delay_reason_required"}`.

- [ ] **Step 6: Confirm completion succeeds with a category and optional detail**

Run: `curl -s -w "\nHTTP %{http_code}\n" -b "<cookie>" -X POST "http://localhost:5177/api/windows/<windowId>/complete" -H "Content-Type: application/json" -d "{\"rollsCount\":10,\"delayReasonCategory\":\"FALTA_MATERIAL_PT\",\"delayReason\":\"Esperando rollos del turno anterior\"}"`
Expected: `HTTP 200`, response body shows `"status":"COMPLETED"`, `"delayReasonCategory":"FALTA_MATERIAL_PT"`, `"delayReason":"Esperando rollos del turno anterior"`.

- [ ] **Step 7: Confirm the activity log and reports summary reflect the delay**

Create a throwaway script `_verify-delay-signal.ts` (do not commit), replacing `<windowId>`:

```ts
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const logs = await prisma.activityLog.findMany({
    where: { entityId: "<windowId>", action: "COMPLETE" },
  });
  console.log("COMPLETE log detail:", logs.map((l) => l.detail));
}

main().finally(() => prisma.$disconnect());
```

Run: `DATABASE_URL="postgresql://postgres:1234@localhost:5432/app_template" npx tsx _verify-delay-signal.ts`
Expected: `COMPLETE log detail: [ 'Retraso: Falta de material en PT — Esperando rollos del turno anterior' ]`.

Run: `curl -s -b "<cookie>" "http://localhost:5177/api/reports/summary" | node -pe "JSON.parse(require('fs').readFileSync(0,'utf8')).delaysByClient"`
Expected: an array including an entry with `count >= 1` for the client used in Step 3 — confirms
`reports.summary.ts` now counts this window's delay via `delayReasonCategory`.

- [ ] **Step 8: Clean up**

Run: `rm -f _verify-mint-cookie.ts _verify-backdate-start.ts _verify-delay-signal.ts`

Find and stop the dev server from Step 2 (e.g. `netstat -ano | grep :5177` on Windows to find the
PID, then `taskkill //PID <pid> //T //F`).
