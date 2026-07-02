# Control de retrasos (avisos automáticos) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically email a single recipient when a `SCHEDULED` window blows past its scheduled time by 15, 30, 45, or 60 minutes, without duplicating notifications and without any new infrastructure.

**Architecture:** Add `Window.lastDelayNotifiedMinutes` to track the highest threshold already notified. A pure function decides which threshold (if any) applies for a given elapsed time. A `setInterval`-based worker, started once from the root route's loader and guarded against double-start, polls every 60 seconds for overdue `SCHEDULED` windows and fires the pure function per window, updating state and sending email/activity-log side effects only when it returns a new threshold.

**Tech Stack:** React Router v7 (root loader), Prisma/PostgreSQL, the existing `sendEmail` service (MS Graph), Vitest.

## Global Constraints

- Delay notifications go to `process.env.ARRIVAL_NOTIFICATION_EMAIL` — the same single recipient as the arrival email from the prior sub-project (confirmed with the client: one point of contact). No new env var.
- Thresholds are fixed at 15, 30, 45, 60 minutes and the poll interval is fixed at 60 seconds — not configurable via env vars, since the client specified concrete values.
- If a window is already past multiple thresholds the first time it's checked (e.g., after a server restart), send only the single highest applicable threshold — never replay the skipped ones.
- A window leaving `SCHEDULED` (to `ARRIVED`, `IN_PROGRESS`, `COMPLETED`, or `CANCELLED`) must stop being a candidate for new delay notifications with no extra bookkeeping — this falls out of querying only `status: "SCHEDULED"`.
- If the notification email fails to send, the check must still record `lastDelayNotifiedMinutes` and the activity log entry — a delivery failure must not cause the same threshold to be retried forever.
- No integration/DB test harness exists in this repo (`vitest.config.ts` only runs `app/**/*.test.ts` with no Postgres setup) — unit-test the pure threshold function only; verify the worker/DB/email glue manually, per the pattern used in the prior sub-project's plan.

---

### Task 1: Prisma schema — `lastDelayNotifiedMinutes` field

**Files:**
- Modify: `prisma/schema.prisma:57-79`

**Interfaces:**
- Produces: `Window.lastDelayNotifiedMinutes: number | null` — consumed by Task 3 (`delayEscalation.server.ts`).

- [ ] **Step 1: Add the field**

In `prisma/schema.prisma`, change:

```prisma
  rollsCount      Int?
  delayReason     String?
  overrideRequest OverrideRequest?
```

to:

```prisma
  rollsCount      Int?
  delayReason     String?
  lastDelayNotifiedMinutes Int?
  overrideRequest OverrideRequest?
```

- [ ] **Step 2: Ensure Postgres is reachable, then generate and run the migration**

If the Postgres container isn't already running with its port published (from the prior
sub-project, `docker-compose.yml` publishes `5432:5432`), start it:

Run: `docker compose up -d postgres`
Expected: container `app-template-postgres` running and healthy (`docker compose ps` shows
`healthy`).

Then:

Run: `DATABASE_URL="postgresql://postgres:1234@localhost:5432/app_template" npx prisma migrate dev --name add_window_delay_notification`
Expected: a new folder under `prisma/migrations/` with the `ALTER TABLE ... ADD COLUMN` SQL, and
the command exits without error.

- [ ] **Step 3: Regenerate the Prisma client**

Run: `npx prisma generate`
Expected: `✔ Generated Prisma Client` with no errors (this ensures `@prisma/client`'s
`Window` type includes `lastDelayNotifiedMinutes` for TypeScript).

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: add lastDelayNotifiedMinutes to Window"
```

---

### Task 2: Pure delay-threshold function (TDD)

**Files:**
- Create: `app/lib/delayThresholds.ts`
- Test: `app/lib/delayThresholds.test.ts`

**Interfaces:**
- Produces: `DELAY_THRESHOLDS_MINUTES: readonly [15, 30, 45, 60]`,
  `getDelayThresholdToNotify(elapsedMinutes: number, lastNotified: number | null): number | null`
  — consumed by Task 3 (`delayEscalation.server.ts`).

- [ ] **Step 1: Write the failing tests**

Create `app/lib/delayThresholds.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { getDelayThresholdToNotify } from "./delayThresholds";

describe("getDelayThresholdToNotify", () => {
  it("returns null when elapsed time is under the first threshold", () => {
    expect(getDelayThresholdToNotify(10, null)).toBeNull();
  });

  it("returns 15 exactly at the 15-minute mark with no prior notification", () => {
    expect(getDelayThresholdToNotify(15, null)).toBe(15);
  });

  it("returns 15 between the 15 and 30 minute marks with no prior notification", () => {
    expect(getDelayThresholdToNotify(20, null)).toBe(15);
  });

  it("returns null when already notified at the applicable threshold", () => {
    expect(getDelayThresholdToNotify(20, 15)).toBeNull();
  });

  it("returns 30 once past the 30-minute mark even if 15 was already notified", () => {
    expect(getDelayThresholdToNotify(35, 15)).toBe(30);
  });

  it("returns only the highest applicable threshold when multiple were skipped", () => {
    expect(getDelayThresholdToNotify(70, null)).toBe(60);
  });

  it("returns null once the highest threshold (60) has already been notified", () => {
    expect(getDelayThresholdToNotify(90, 60)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run app/lib/delayThresholds.test.ts`
Expected: FAIL with "Failed to resolve import ./delayThresholds" (file doesn't exist yet).

- [ ] **Step 3: Write the minimal implementation**

Create `app/lib/delayThresholds.ts`:

```ts
export const DELAY_THRESHOLDS_MINUTES = [15, 30, 45, 60] as const;

export function getDelayThresholdToNotify(
  elapsedMinutes: number,
  lastNotified: number | null
): number | null {
  const applicable = DELAY_THRESHOLDS_MINUTES.filter((t) => elapsedMinutes >= t);
  if (applicable.length === 0) return null;
  const highest = applicable[applicable.length - 1];
  if (lastNotified !== null && lastNotified >= highest) return null;
  return highest;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run app/lib/delayThresholds.test.ts`
Expected: PASS, 7 tests passed.

- [ ] **Step 5: Commit**

```bash
git add app/lib/delayThresholds.ts app/lib/delayThresholds.test.ts
git commit -m "feat: add pure delay-threshold escalation logic"
```

---

### Task 3: Delay escalation worker

**Files:**
- Create: `app/lib/delayEscalation.server.ts`

**Interfaces:**
- Consumes: `prisma` (`~/lib/db.server`), `sendEmail` (`~/services/email.server`),
  `WINDOW_TYPE_LABEL` (`~/lib/windowStatus`), `DELAY_THRESHOLDS_MINUTES` /
  `getDelayThresholdToNotify` (`~/lib/delayThresholds`, Task 2), `ARRIVAL_NOTIFICATION_EMAIL` /
  `MAIL_SENDER` env vars.
- Produces: `startDelayEscalationWorker(): void` — consumed by Task 4 (`root.tsx`).
  `checkDelays(): Promise<void>` — exported for direct invocation during manual verification
  (Task 5), so a tester doesn't have to wait up to 60 seconds for the interval to fire.

- [ ] **Step 1: Create the worker module**

Create `app/lib/delayEscalation.server.ts`:

```ts
import { prisma } from "~/lib/db.server";
import { sendEmail } from "~/services/email.server";
import { WINDOW_TYPE_LABEL } from "~/lib/windowStatus";
import { format } from "date-fns";
import { DELAY_THRESHOLDS_MINUTES, getDelayThresholdToNotify } from "./delayThresholds";

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

    const recipient = process.env.ARRIVAL_NOTIFICATION_EMAIL;
    if (recipient) {
      try {
        await sendEmail({
          fromEmail: process.env.MAIL_SENDER!,
          toAddresses: [recipient],
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
      console.warn(
        "ARRIVAL_NOTIFICATION_EMAIL no está configurado; se omite el correo de retraso."
      );
    }
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/lib/delayEscalation.server.ts
git commit -m "feat: add delay escalation worker (15/30/45/60 min emails)"
```

---

### Task 4: Start the worker on server boot

**Files:**
- Modify: `app/root.tsx`

**Interfaces:**
- Consumes: `startDelayEscalationWorker` (`~/lib/delayEscalation.server`, Task 3).

- [ ] **Step 1: Add the loader**

In `app/root.tsx`, change:

```tsx
import type { Route } from "./+types/root";
import { Toaster } from "~/components/ui/sonner";
import "./app.css";
```

to:

```tsx
import type { Route } from "./+types/root";
import { Toaster } from "~/components/ui/sonner";
import { startDelayEscalationWorker } from "~/lib/delayEscalation.server";
import "./app.css";

export async function loader() {
  startDelayEscalationWorker();
  return null;
}
```

Leave every other export in `app/root.tsx` (`links`, `Layout`, `App`, `ErrorBoundary`) untouched.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/root.tsx
git commit -m "feat: start delay escalation worker from the root loader"
```

---

### Task 5: End-to-end verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full automated suite**

Run: `npx vitest run && npm run typecheck`
Expected: all test files pass (including the 7 new `delayThresholds` tests), zero typecheck
errors.

- [ ] **Step 2: Start a local server against the reachable database**

Ensure Postgres is running with its port published (`docker compose up -d postgres`, per Task 1
Step 2), then run:

Run: `DATABASE_URL="postgresql://postgres:1234@localhost:5432/app_template" npx react-router dev --port 5177`
Expected: server starts and logs `Local: http://localhost:5177/`.

- [ ] **Step 3: Create a backdated `SCHEDULED` window directly in the database**

Run `npx tsx prisma/seed.ts` first (with `DATABASE_URL` pointed at `localhost:5432`, per Task 1
Step 2) if it hasn't been run yet in this environment, so a `Client` and `Warehouse` exist to
reference.

In the project root, create a throwaway script `_verify-backdate-window.ts` (do not commit this
file):

```ts
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const client = await prisma.client.findFirstOrThrow();
  const warehouse = await prisma.warehouse.findFirstOrThrow();
  const scheduledStart = new Date(Date.now() - 20 * 60_000);
  const window = await prisma.window.create({
    data: {
      clientId: client.id,
      warehouseId: warehouse.id,
      scheduledStart,
      scheduledEnd: new Date(scheduledStart.getTime() + client.avgLoadTime * 60_000),
      operatorName: "Verificación",
      licensePlate: "VER-001",
      createdBy: 1,
    },
  });
  console.log(window.id);
}

main().finally(() => prisma.$disconnect());
```

Run: `DATABASE_URL="postgresql://postgres:1234@localhost:5432/app_template" npx tsx _verify-backdate-window.ts`
Expected: prints a window id. That window's `scheduledStart` is ~20 minutes before "now",
`status: "SCHEDULED"`, `lastDelayNotifiedMinutes: null`.

- [ ] **Step 4: Manually invoke `checkDelays()` instead of waiting for the interval**

Create a second throwaway script `_verify-check-delays.ts` (do not commit this file):

```ts
import "dotenv/config";
import { checkDelays } from "./app/lib/delayEscalation.server";

checkDelays()
  .then(() => console.log("checkDelays completed"))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
```

Run: `DATABASE_URL="postgresql://postgres:1234@localhost:5432/app_template" npx tsx _verify-check-delays.ts`
Expected: prints `checkDelays completed` with no thrown error. If `ARRIVAL_NOTIFICATION_EMAIL` is
unset in the environment, stdout/stderr also shows the
"ARRIVAL_NOTIFICATION_EMAIL no está configurado; se omite el correo de retraso." warning instead
of a crash.

Then confirm the side effects with a third throwaway script `_verify-check-delays-result.ts` (do
not commit this file):

```ts
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const window = await prisma.window.findFirstOrThrow({
    where: { operatorName: "Verificación" },
    orderBy: { createdAt: "desc" },
  });
  console.log("lastDelayNotifiedMinutes:", window.lastDelayNotifiedMinutes);

  const logs = await prisma.activityLog.findMany({
    where: { entityId: window.id, action: "DELAY_NOTIFY" },
  });
  console.log("DELAY_NOTIFY log rows:", logs.length, logs.map((l) => l.detail));
}

main().finally(() => prisma.$disconnect());
```

Run: `DATABASE_URL="postgresql://postgres:1234@localhost:5432/app_template" npx tsx _verify-check-delays-result.ts`
Expected output: `lastDelayNotifiedMinutes: 15` and `DELAY_NOTIFY log rows: 1 [ 'Aviso de 15 minutos de retraso' ]`.

- [ ] **Step 5: Confirm re-running `checkDelays()` immediately does not re-notify**

Run `npx tsx _verify-check-delays.ts` again (same command as Step 4), then
`npx tsx _verify-check-delays-result.ts` again.
Expected: `lastDelayNotifiedMinutes` is still `15` and `DELAY_NOTIFY log rows` is still `1` (no
duplicate row, no duplicate email attempt) — confirms `getDelayThresholdToNotify` correctly
returns `null` once already notified at the applicable threshold.

- [ ] **Step 6: Confirm the window drops out once it's no longer `SCHEDULED`**

With the local dev server from Step 2 still running, create a throwaway script
`_verify-mint-cookie.ts` (do not commit this file) to mint a session cookie for the seeded
`admin@example.com` user:

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
Expected: prints a `_session=...` cookie value.

Using that cookie value and the window id printed in Step 3, mark the window as arrived:

Run: `curl -s -b "_session=<value from above>" -X POST http://localhost:5177/api/windows/<window id from Step 3>/arrive`
Expected: `HTTP 200` with `"status":"ARRIVED"` in the response body.

Re-run the check from Step 4 (`npx tsx _verify-check-delays.ts`) and then the result script from
Step 4 (`npx tsx _verify-check-delays-result.ts`).
Expected: `DELAY_NOTIFY log rows` is still `1` (unchanged) — no new row was created, because the
query in `checkDelays()` only selects `status: "SCHEDULED"` and this window is now `ARRIVED`.

Delete the throwaway scripts:

Run: `rm -f _verify-backdate-window.ts _verify-check-delays.ts _verify-check-delays-result.ts _verify-mint-cookie.ts`

- [ ] **Step 7: Stop the local dev server**

Find and terminate the process started in Step 2 (e.g., via `netstat -ano | grep :5177` on
Windows to find the PID, then `taskkill //PID <pid> //T //F`).
