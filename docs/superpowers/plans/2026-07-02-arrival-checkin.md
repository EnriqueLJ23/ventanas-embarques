# Llegada a planta (check-in por QR) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separate "llegada a planta" from "inicio de operación" so that scanning a window's QR records a real arrival timestamp and emails a single notification recipient, without disturbing the existing start/complete flow.

**Architecture:** Add an `ARRIVED` status and `actualArrival` timestamp to `Window`. The QR now encodes a `/checkin/:id` URL instead of a plain-text block. A new `POST /api/windows/:id/arrive` action performs the transition, logs activity, and emails a single configured recipient. `start` is widened to accept `SCHEDULED` or `ARRIVED` and backfills `actualArrival` if it was skipped. Status-transition legality lives in a small pure module so it's unit-testable without a database, matching how `windowOverlap.ts` is tested today.

**Tech Stack:** React Router v7 (file routes + loaders/actions), Prisma/PostgreSQL, `qrcode.react`, MS Graph `sendMail` via the existing `app/services/email.server.ts`, Vitest.

## Global Constraints

- `ARRIVAL_NOTIFICATION_EMAIL` is a single recipient address (not per-warehouse) — confirmed with the client: one person receives the arrival notice.
- If the notification email fails to send, the check-in itself must NOT fail or roll back — the truck has physically arrived regardless of email delivery.
- The new `ARRIVED` status sits between `SCHEDULED` and `IN_PROGRESS` in the state machine: `SCHEDULED → ARRIVED → IN_PROGRESS → COMPLETED` (plus `CANCELLED` as today).
- Only roles `CARGA`, `DESCARGA`, `ADMINISTRADOR` may confirm arrival or start a window — identical to the existing role gate on `start`/`complete`.
- The QR still shows the human-readable text block (`buildQrPayload`) beneath the code for readability; only the encoded QR *value* changes to a URL.
- No integration/DB test harness exists in this repo (`vitest.config.ts` only runs `app/**/*.test.ts` with no Postgres setup) — follow the existing convention of unit-testing pure logic only (see `windowOverlap.test.ts`) and leave Prisma-touching routes covered by manual verification, not automated tests.

---

### Task 1: Prisma schema — `ARRIVED` status + `actualArrival` field

**Files:**
- Modify: `prisma/schema.prisma:57-90`

**Interfaces:**
- Produces: `WindowStatus` enum value `ARRIVED`; `Window.actualArrival: DateTime | null` — consumed by every later task.

- [ ] **Step 1: Edit the `WindowStatus` enum**

In `prisma/schema.prisma`, change:

```prisma
enum WindowStatus {
  SCHEDULED
  IN_PROGRESS
  COMPLETED
  CANCELLED
}
```

to:

```prisma
enum WindowStatus {
  SCHEDULED
  ARRIVED
  IN_PROGRESS
  COMPLETED
  CANCELLED
}
```

- [ ] **Step 2: Add `actualArrival` to the `Window` model**

In the same file, change:

```prisma
  status          WindowStatus     @default(SCHEDULED)
  actualStart     DateTime?
  actualEnd       DateTime?
```

to:

```prisma
  status          WindowStatus     @default(SCHEDULED)
  actualArrival   DateTime?
  actualStart     DateTime?
  actualEnd       DateTime?
```

- [ ] **Step 3: Generate and run the migration**

Run: `npx prisma migrate dev --name add_window_arrival`
Expected: a new folder under `prisma/migrations/` containing the `ALTER TYPE`/`ALTER TABLE` SQL, and the command exits without error.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: add ARRIVED window status and actualArrival timestamp"
```

---

### Task 2: Pure window-transition guards (TDD)

**Files:**
- Create: `app/lib/windowTransitions.ts`
- Test: `app/lib/windowTransitions.test.ts`

**Interfaces:**
- Consumes: `WindowStatus` type from `@prisma/client` (available after Task 1's `prisma migrate dev`, which runs `prisma generate`).
- Produces: `canArrive(status: WindowStatus): boolean`, `canStart(status: WindowStatus): boolean` — consumed by Task 6 (`arrive` action) and Task 7 (`start` action).

- [ ] **Step 1: Write the failing tests**

Create `app/lib/windowTransitions.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { canArrive, canStart } from "./windowTransitions";

describe("canArrive", () => {
  it("returns true when status is SCHEDULED", () => {
    expect(canArrive("SCHEDULED")).toBe(true);
  });

  it("returns false when status is ARRIVED", () => {
    expect(canArrive("ARRIVED")).toBe(false);
  });

  it("returns false when status is IN_PROGRESS", () => {
    expect(canArrive("IN_PROGRESS")).toBe(false);
  });

  it("returns false when status is COMPLETED", () => {
    expect(canArrive("COMPLETED")).toBe(false);
  });

  it("returns false when status is CANCELLED", () => {
    expect(canArrive("CANCELLED")).toBe(false);
  });
});

describe("canStart", () => {
  it("returns true when status is SCHEDULED", () => {
    expect(canStart("SCHEDULED")).toBe(true);
  });

  it("returns true when status is ARRIVED", () => {
    expect(canStart("ARRIVED")).toBe(true);
  });

  it("returns false when status is IN_PROGRESS", () => {
    expect(canStart("IN_PROGRESS")).toBe(false);
  });

  it("returns false when status is COMPLETED", () => {
    expect(canStart("COMPLETED")).toBe(false);
  });

  it("returns false when status is CANCELLED", () => {
    expect(canStart("CANCELLED")).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run app/lib/windowTransitions.test.ts`
Expected: FAIL with "Failed to resolve import ./windowTransitions" (file doesn't exist yet).

- [ ] **Step 3: Write the minimal implementation**

Create `app/lib/windowTransitions.ts`:

```ts
import type { WindowStatus } from "@prisma/client";

export function canArrive(status: WindowStatus): boolean {
  return status === "SCHEDULED";
}

export function canStart(status: WindowStatus): boolean {
  return status === "SCHEDULED" || status === "ARRIVED";
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run app/lib/windowTransitions.test.ts`
Expected: PASS, 10 tests passed.

- [ ] **Step 5: Commit**

```bash
git add app/lib/windowTransitions.ts app/lib/windowTransitions.test.ts
git commit -m "feat: add pure window-transition guards for arrive/start"
```

---

### Task 3: QR check-in URL builder (TDD)

**Files:**
- Modify: `app/lib/qr.ts`
- Test: `app/lib/qr.test.ts`

**Interfaces:**
- Produces: `buildCheckinUrl(origin: string, windowId: string): string` — consumed by Task 10 (`WindowQrDialog.tsx`).

- [ ] **Step 1: Write the failing tests**

Create `app/lib/qr.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildCheckinUrl } from "./qr";

describe("buildCheckinUrl", () => {
  it("joins the origin and window id into a checkin path", () => {
    expect(buildCheckinUrl("https://embarques.tq1.com.mx", "w1")).toBe(
      "https://embarques.tq1.com.mx/checkin/w1"
    );
  });

  it("does not produce a double slash when origin has a trailing slash", () => {
    expect(buildCheckinUrl("https://embarques.tq1.com.mx/", "w1")).toBe(
      "https://embarques.tq1.com.mx/checkin/w1"
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run app/lib/qr.test.ts`
Expected: FAIL with "buildCheckinUrl is not exported" or similar.

- [ ] **Step 3: Add the implementation**

In `app/lib/qr.ts`, add this export alongside the existing `buildQrPayload` (leave `buildQrPayload` untouched):

```ts
export function buildCheckinUrl(origin: string, windowId: string): string {
  return `${origin.replace(/\/$/, "")}/checkin/${windowId}`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run app/lib/qr.test.ts`
Expected: PASS, 2 tests passed.

- [ ] **Step 5: Commit**

```bash
git add app/lib/qr.ts app/lib/qr.test.ts
git commit -m "feat: add buildCheckinUrl for QR-scan check-in links"
```

---

### Task 4: `ARRIVED` status labels, badge, and calendar colors

**Files:**
- Modify: `app/lib/windowStatus.ts`
- Modify: `app/components/calendar/ShipmentCalendar.tsx:5-10`
- Modify: `app/routes/calendar.tsx:36-41`

**Interfaces:**
- Consumes: `WindowStatus` from `@prisma/client` (Task 1).
- Produces: `WINDOW_STATUS_LABEL.ARRIVED`, `WINDOW_STATUS_BADGE_VARIANT.ARRIVED`, `WINDOW_TYPE_LABEL` — consumed by Task 6 (email body), Task 8 (`checkin.tsx`), Task 9 (`detail.tsx`).

This task is presentational/config-only; there's no existing test coverage for these files (`windowStatus.ts`, `ShipmentCalendar.tsx`, legend arrays are untested today), so no test step here — matches the codebase's existing pattern.

- [ ] **Step 1: Update `app/lib/windowStatus.ts`**

Replace the full file with:

```ts
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
```

- [ ] **Step 2: Add the `ARRIVED` color to the calendar**

In `app/components/calendar/ShipmentCalendar.tsx`, change:

```tsx
const STATUS_COLORS: Record<string, string> = {
  SCHEDULED: "#64748b",
  IN_PROGRESS: "#2563eb",
  COMPLETED: "#16a34a",
  CANCELLED: "#dc2626",
};
```

to:

```tsx
const STATUS_COLORS: Record<string, string> = {
  SCHEDULED: "#64748b",
  ARRIVED: "#d97706",
  IN_PROGRESS: "#2563eb",
  COMPLETED: "#16a34a",
  CANCELLED: "#dc2626",
};
```

- [ ] **Step 3: Add the `ARRIVED` entry to the calendar legend**

In `app/routes/calendar.tsx`, change:

```tsx
const STATUS_LEGEND: { label: string; colorClass: string }[] = [
  { label: "Programada", colorClass: "bg-slate-500" },
  { label: "En curso", colorClass: "bg-blue-600" },
  { label: "Completada", colorClass: "bg-green-600" },
  { label: "Cancelada", colorClass: "bg-red-600" },
];
```

to:

```tsx
const STATUS_LEGEND: { label: string; colorClass: string }[] = [
  { label: "Programada", colorClass: "bg-slate-500" },
  { label: "Llegó a planta", colorClass: "bg-amber-600" },
  { label: "En curso", colorClass: "bg-blue-600" },
  { label: "Completada", colorClass: "bg-green-600" },
  { label: "Cancelada", colorClass: "bg-red-600" },
];
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: no errors. (This confirms every existing `Record<WindowStatus, ...>` usage in the codebase now has an `ARRIVED` entry — TypeScript fails to compile otherwise.)

- [ ] **Step 5: Commit**

```bash
git add app/lib/windowStatus.ts app/components/calendar/ShipmentCalendar.tsx app/routes/calendar.tsx
git commit -m "feat: add ARRIVED status label, badge, and calendar color"
```

---

### Task 5: `.env` scaffolding for the notification recipient

**Files:**
- Modify: `.env`

**Interfaces:**
- Produces: `ARRIVAL_NOTIFICATION_EMAIL` env var — consumed by Task 6.

- [ ] **Step 1: Add the new variable**

In `.env`, append after the `MAIL_SENDER` line:

```env
MAIL_SENDER="no-reply@tq1.com.mx"

# Persona que recibe el aviso de "Unidad ingresó a planta"
ARRIVAL_NOTIFICATION_EMAIL=
```

Leave the value empty for now — fill it in with the real recipient's address before deploying. The `arrive` action (Task 6) skips sending (with a logged warning) rather than crashing when this is unset, so development works without it.

- [ ] **Step 2: Commit**

`.env` is typically gitignored in projects like this — check first:

Run: `git check-ignore .env`
Expected: prints `.env` (meaning it's ignored and this step is done — nothing to commit).

If it does NOT print `.env` (i.e., the file is tracked), then run:

```bash
git add .env
git commit -m "chore: add ARRIVAL_NOTIFICATION_EMAIL env var placeholder"
```

---

### Task 6: `POST /api/windows/:id/arrive` action

**Files:**
- Create: `app/routes/api/windows.$id.arrive.ts`
- Modify: `app/routes.ts:38-41`

**Interfaces:**
- Consumes: `requireUser` (`~/lib/session.server`), `prisma` (`~/lib/db.server`), `logActivity` (`~/lib/activity.server`), `canArrive` (`~/lib/windowTransitions`, Task 2), `sendEmail` (`~/services/email.server`), `WINDOW_TYPE_LABEL` (`~/lib/windowStatus`, Task 4), `ARRIVAL_NOTIFICATION_EMAIL` / `MAIL_SENDER` env vars (Task 5).
- Produces: `POST /api/windows/:id/arrive` — returns `200` with the updated `Window` on success, `409` with `{ error: "not_scheduled", window }` if the window isn't `SCHEDULED` — consumed by Task 8 (`checkin.tsx`) and Task 9 (`detail.tsx`).

- [ ] **Step 1: Register the route**

In `app/routes.ts`, change:

```ts
  route("api/windows/:id/start", "./routes/api/windows.$id.start.ts"),
  route("api/windows/:id/complete", "./routes/api/windows.$id.complete.ts"),
```

to:

```ts
  route("api/windows/:id/arrive", "./routes/api/windows.$id.arrive.ts"),
  route("api/windows/:id/start", "./routes/api/windows.$id.start.ts"),
  route("api/windows/:id/complete", "./routes/api/windows.$id.complete.ts"),
```

- [ ] **Step 2: Create the action**

Create `app/routes/api/windows.$id.arrive.ts`:

```ts
import type { Route } from "./+types/windows.$id.arrive";
import { requireUser } from "~/lib/session.server";
import { prisma } from "~/lib/db.server";
import { logActivity } from "~/lib/activity.server";
import { canArrive } from "~/lib/windowTransitions";
import { sendEmail } from "~/services/email.server";
import { WINDOW_TYPE_LABEL } from "~/lib/windowStatus";
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

  const recipient = process.env.ARRIVAL_NOTIFICATION_EMAIL;
  if (recipient) {
    try {
      await sendEmail({
        fromEmail: process.env.MAIL_SENDER!,
        toAddresses: [recipient],
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
    console.warn(
      "ARRIVAL_NOTIFICATION_EMAIL no está configurado; se omite el correo de llegada."
    );
  }

  return Response.json(window);
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors (this regenerates `./+types/windows.$id.arrive` from the route registration in Step 1, so Step 1 must land first).

- [ ] **Step 4: Commit**

```bash
git add app/routes/api/windows.$id.arrive.ts app/routes.ts
git commit -m "feat: add POST /api/windows/:id/arrive with arrival email"
```

---

### Task 7: Widen `start` to accept `SCHEDULED` or `ARRIVED`

**Files:**
- Modify: `app/routes/api/windows.$id.start.ts`

**Interfaces:**
- Consumes: `canStart` (`~/lib/windowTransitions`, Task 2).
- Produces: same `POST /api/windows/:id/start` contract as before, now also returns `409` with `{ error: "not_arrivable", window }` for illegal transitions, and backfills `actualArrival` when it was `null`.

- [ ] **Step 1: Replace the action**

Replace the full contents of `app/routes/api/windows.$id.start.ts` with:

```ts
import type { Route } from "./+types/windows.$id.start";
import { requireUser } from "~/lib/session.server";
import { prisma } from "~/lib/db.server";
import { logActivity } from "~/lib/activity.server";
import { canStart } from "~/lib/windowTransitions";

export async function action({ request, params }: Route.ActionArgs) {
  const user = await requireUser(request, ["CARGA", "DESCARGA", "ADMINISTRADOR"]);

  const existing = await prisma.window.findUniqueOrThrow({
    where: { id: params.id },
  });

  if (!canStart(existing.status)) {
    return Response.json({ error: "not_arrivable", window: existing }, { status: 409 });
  }

  const now = new Date();
  const window = await prisma.window.update({
    where: { id: params.id },
    data: {
      status: "IN_PROGRESS",
      actualStart: now,
      actualArrival: existing.actualArrival ?? now,
    },
  });

  await logActivity({
    userId: user.id,
    action: "START",
    entity: "Window",
    entityId: window.id,
  });

  return Response.json(window);
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Manual verification**

Run: `npm run dev`, log in as a `CARGA` or `ADMINISTRADOR` user, open a `SCHEDULED` window's detail page, click "Iniciar" directly (skipping check-in).
Expected: the window moves to `IN_PROGRESS` and `actualArrival` is set in the database to the same moment as `actualStart` (check via `npx prisma studio` or a `SELECT` on the `Window` table).

- [ ] **Step 4: Commit**

```bash
git add app/routes/api/windows.$id.start.ts
git commit -m "feat: allow start from SCHEDULED or ARRIVED, backfill actualArrival"
```

---

### Task 8: `/checkin/:id` page

**Files:**
- Create: `app/routes/checkin.tsx`
- Modify: `app/routes.ts:9-15`

**Interfaces:**
- Consumes: `requireUser`, `prisma`, `WINDOW_STATUS_LABEL` / `WINDOW_STATUS_BADGE_VARIANT` (Task 4), `POST /api/windows/:id/arrive` (Task 6).
- Produces: `GET /checkin/:id` page — no other task depends on its internals.

- [ ] **Step 1: Register the route**

In `app/routes.ts`, change:

```ts
    route("windows/new", "./routes/windows/new.tsx"),
    route("windows/:id", "./routes/windows/detail.tsx"),
    route("reports", "./routes/reports.tsx"),
```

to:

```ts
    route("windows/new", "./routes/windows/new.tsx"),
    route("windows/:id", "./routes/windows/detail.tsx"),
    route("checkin/:id", "./routes/checkin.tsx"),
    route("reports", "./routes/reports.tsx"),
```

- [ ] **Step 2: Create the page**

Create `app/routes/checkin.tsx`:

```tsx
import { useState } from "react";
import { useNavigate } from "react-router";
import type { Route } from "./+types/checkin";
import { requireUser } from "~/lib/session.server";
import { prisma } from "~/lib/db.server";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { toast } from "sonner";
import { format } from "date-fns";
import { WINDOW_STATUS_BADGE_VARIANT, WINDOW_STATUS_LABEL } from "~/lib/windowStatus";
import { CheckCircle2 } from "lucide-react";

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireUser(request, ["CARGA", "DESCARGA", "ADMINISTRADOR"]);
  const window = await prisma.window.findUniqueOrThrow({
    where: { id: params.id },
    include: { client: true, warehouse: true },
  });
  return { window };
}

export default function Checkin({ loaderData }: Route.ComponentProps) {
  const { window } = loaderData;
  const navigate = useNavigate();
  const [status, setStatus] = useState(window.status);
  const [loading, setLoading] = useState(false);

  async function handleConfirm() {
    setLoading(true);
    const res = await fetch(`/api/windows/${window.id}/arrive`, { method: "POST" });
    setLoading(false);
    if (!res.ok && res.status !== 409) {
      toast.error("No se pudo registrar la llegada");
      return;
    }
    toast.success("Llegada registrada");
    setStatus("ARRIVED");
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <CardTitle>{window.client.name}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground uppercase">Operador</p>
              <p className="font-medium">{window.operatorName}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase">Placas</p>
              <p className="font-medium">{window.licensePlate}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase">Nave</p>
              <p className="font-medium">{window.warehouse.name}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase">Hora programada</p>
              <p className="font-medium">{format(new Date(window.scheduledStart), "HH:mm")}</p>
            </div>
          </div>

          {status === "SCHEDULED" ? (
            <Button className="w-full" size="lg" onClick={handleConfirm} disabled={loading}>
              Confirmar llegada
            </Button>
          ) : (
            <div className="flex flex-col items-center gap-2 py-4 text-center">
              <CheckCircle2 className="size-10 text-green-600" />
              <Badge variant={WINDOW_STATUS_BADGE_VARIANT[status]}>
                {WINDOW_STATUS_LABEL[status]}
              </Badge>
              <Button variant="outline" size="sm" onClick={() => navigate(`/windows/${window.id}`)}>
                Ver detalle
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, log in as `CARGA`/`DESCARGA`/`ADMINISTRADOR`, navigate to `/checkin/<a SCHEDULED window's id>`.
Expected: card shows client, operator, plate, warehouse, scheduled time, and a "Confirmar llegada" button. Clicking it shows a success toast and swaps to the confirmed state with an "Llegó a planta" badge. Reloading the same URL now shows the confirmed state directly (no button) instead of erroring.

- [ ] **Step 5: Commit**

```bash
git add app/routes/checkin.tsx app/routes.ts
git commit -m "feat: add /checkin/:id arrival confirmation page"
```

---

### Task 9: "Confirmar llegada" button on `/windows/:id`

**Files:**
- Modify: `app/routes/windows/detail.tsx`

**Interfaces:**
- Consumes: `POST /api/windows/:id/arrive` (Task 6).

- [ ] **Step 1: Add the handler**

In `app/routes/windows/detail.tsx`, change:

```tsx
  async function handleStart() {
    const res = await fetch(`/api/windows/${window.id}/start`, { method: "POST" });
    if (!res.ok) {
      toast.error("No se pudo iniciar la ventana");
      return;
    }
    toast.success("Ventana iniciada");
    navigate(".", { replace: true });
  }
```

to:

```tsx
  async function handleArrive() {
    const res = await fetch(`/api/windows/${window.id}/arrive`, { method: "POST" });
    if (!res.ok) {
      toast.error("No se pudo registrar la llegada");
      return;
    }
    toast.success("Llegada registrada");
    navigate(".", { replace: true });
  }

  async function handleStart() {
    const res = await fetch(`/api/windows/${window.id}/start`, { method: "POST" });
    if (!res.ok) {
      toast.error("No se pudo iniciar la ventana");
      return;
    }
    toast.success("Ventana iniciada");
    navigate(".", { replace: true });
  }
```

- [ ] **Step 2: Add the button**

In the same file, change:

```tsx
        action={
          <div className="flex gap-2">
            {window.status === "SCHEDULED" && <Button onClick={handleStart}>Iniciar</Button>}
            {window.status === "IN_PROGRESS" && (
              <Button onClick={() => setCompleteOpen(true)}>Completar</Button>
            )}
```

to:

```tsx
        action={
          <div className="flex gap-2">
            {window.status === "SCHEDULED" && (
              <Button variant="outline" onClick={handleArrive}>
                Confirmar llegada
              </Button>
            )}
            {(window.status === "SCHEDULED" || window.status === "ARRIVED") && (
              <Button onClick={handleStart}>Iniciar</Button>
            )}
            {window.status === "IN_PROGRESS" && (
              <Button onClick={() => setCompleteOpen(true)}>Completar</Button>
            )}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, open a `SCHEDULED` window's `/windows/:id` page.
Expected: both "Confirmar llegada" and "Iniciar" buttons are visible. Clicking "Confirmar llegada" shows a success toast, the status badge changes to "Llegó a planta", and "Confirmar llegada" disappears while "Iniciar" remains.

- [ ] **Step 5: Commit**

```bash
git add app/routes/windows/detail.tsx
git commit -m "feat: add manual arrival confirmation button to window detail"
```

---

### Task 10: QR encodes the check-in URL

**Files:**
- Modify: `app/components/qr/WindowQrDialog.tsx`

**Interfaces:**
- Consumes: `buildCheckinUrl` (`~/lib/qr`, Task 3).

- [ ] **Step 1: Switch the QR value**

In `app/components/qr/WindowQrDialog.tsx`, change:

```tsx
import { buildQrPayload, type QrWindowData } from "~/lib/qr";
```

to:

```tsx
import { buildCheckinUrl, buildQrPayload, type QrWindowData } from "~/lib/qr";
```

Then change:

```tsx
        <div ref={containerRef} className="flex flex-col items-center gap-3 bg-white p-4">
          <QRCodeCanvas value={buildQrPayload(windowData)} size={220} />
```

to:

```tsx
        <div ref={containerRef} className="flex flex-col items-center gap-3 bg-white p-4">
          <QRCodeCanvas value={buildCheckinUrl(window.location.origin, windowData.id)} size={220} />
```

`window` here refers to the browser global (the ventana prop is destructured as `windowData`, so there's no naming collision).

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Manual verification**

Run: `npm run dev`, create a new window as `VENTAS`/`ADMINISTRADOR`, open the QR dialog. Scan the QR with a phone camera (or decode it with any QR reader app/site).
Expected: the decoded value is `http://<your dev host>:<port>/checkin/<window id>` and the human-readable text block still renders below the QR unchanged.

- [ ] **Step 4: Commit**

```bash
git add app/components/qr/WindowQrDialog.tsx
git commit -m "feat: encode check-in URL in the window QR instead of plain text"
```

---

## End-to-End Verification

After all 10 tasks are complete:

1. Run `npm run typecheck` and `npx vitest run` — both must pass with zero errors/failures.
2. Run `npm run dev`, create a new window as `VENTAS`.
3. Open the QR dialog, confirm it encodes a `/checkin/:id` URL.
4. Log in as `CARGA` (or `DESCARGA`/`ADMINISTRADOR`) on the same or another session, visit that `/checkin/:id` URL directly.
5. Click "Confirmar llegada" — verify: toast success, page shows "Llegó a planta" badge, `/admin/activity` shows an `ARRIVE` entry, the calendar shows the event in amber, and (if `ARRIVAL_NOTIFICATION_EMAIL` is set and Graph `Mail.Send` is granted) the recipient receives the email.
6. Visit `/windows/:id` for that same window — confirm "Confirmar llegada" is gone, "Iniciar" is still available, click it, confirm it moves to `IN_PROGRESS` without touching `actualArrival` again.
7. Create a second window and click "Iniciar" directly from `/windows/:id` without visiting check-in first — confirm it still works and backfills `actualArrival`.
