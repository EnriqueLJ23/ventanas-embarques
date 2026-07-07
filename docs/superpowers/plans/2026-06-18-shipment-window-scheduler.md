# Shipment Window Scheduler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a full shipment-window scheduling system (4 warehouses/"naves", 4 roles, calendar, QR codes, overlap validation, override requests, Excel reports) on top of the existing React Router v7 + Prisma + Entra ID + ShadCN template.

**Architecture:** React Router v7 framework-mode SSR. Protected UI routes live under the existing `dashboard.tsx` layout. Server logic (CRUD, conflict checks, reports) is implemented as React Router *resource routes* (loader/action only, no component) under `app/routes/api/*`, called from pages via `fetch`/`useFetcher`. Prisma/Postgres for persistence. Role checks via a new `requireUser(request, allowedRoles?)` helper added to the existing session module.

**Tech Stack:** React Router 7.15 (framework mode), Prisma 7 + `@prisma/adapter-pg`, PostgreSQL, ShadCN UI (radix-nova style, already configured, zero components installed yet), `@fullcalendar/react` + `resource-timeline`, `qrcode.react`, `html-to-image`, `exceljs`, `date-fns`, Vitest (new — no test runner currently exists).

## Global Constraints

- Use EXCLUSIVELY ShadCN components for UI. Do not add Tailwind classes that override ShadCN theme tokens defined in `app/app.css`. No custom theme colors.
- Keep the existing ShadCN default theme (`radix-nova`, `neutral` base, already in `app/app.css`) untouched.
- UI copy is in Spanish (es-MX), matching the existing `_root.tsx`/`dashboard.tsx` pages.
- Same/overlapping time windows are forbidden within one warehouse; freely allowed across different warehouses.
- `scheduledEnd` is always derived (`scheduledStart + client.avgLoadTime` minutes), never user-entered.
- Existing `User.id` is `Int @id @default(autoincrement())` — do NOT change this to `String`/`cuid()`; the existing session/auth code (`requireUserId` returns a `number`) depends on it. All new foreign keys to users (`Window.createdBy`, `OverrideRequest.requestedBy/reviewedBy`) are typed `Int`, not `String`, deviating from the original spec text to match the real schema.
- New domain models (`Tier`, `Client`, `Warehouse`, `Window`, `OverrideRequest`) use `String @id @default(cuid())`, per spec.
- File conventions already established: server-only modules end in `.server.ts`; route files are kebab-case/lowercase; path alias `~/*` → `./app/*`.
- Never use `git rebase -i`, force-push, or `prisma migrate reset` against a populated DB without asking first.

---

## File Structure

```
prisma/
  schema.prisma                     # modify: add Role enum + Tier/Client/Warehouse/Window/OverrideRequest/ActivityLog
  seed.ts                           # create: seed data (4 warehouses, 3 tiers, 5 clients, 1 admin)
app/
  lib/
    session.server.ts               # modify: add requireUser(request, allowedRoles?)
    activity.server.ts              # create: logActivity() helper
    validations/
      windowOverlap.server.ts       # create: overlap-check pure function + Prisma query wrapper
    qr.ts                           # create: buildQrPayload(window) text builder
  components/
    ui/                             # create (via shadcn CLI): button, input, label, select, dialog, table,
                                     # card, badge, form, sonner, skeleton, dropdown-menu, tabs, textarea, alert, popover, calendar
    qr/
      WindowQrDialog.tsx             # create: QR display + PNG download
    windows/
      WindowForm.tsx                 # create: shared create-window form
      ConflictAlert.tsx               # create: overlap conflict banner + override request trigger
    calendar/
      ShipmentCalendar.tsx            # create: FullCalendar resourceTimeline wrapper
    admin/
      OverrideBadge.tsx               # create: pending-override counter badge for nav
  routes.ts                          # modify: register all new routes
  routes/
    _root.tsx                        # replace: role-aware dashboard content
    calendar.tsx                     # create: /calendar
    windows/
      new.tsx                        # create: /windows/new
      detail.tsx                     # create: /windows/:id
    admin/
      layout.tsx                     # create: /admin layout (ADMINISTRADOR guard)
      users.tsx                      # create: /admin/users
      clients.tsx                    # create: /admin/clients
      warehouses.tsx                 # create: /admin/warehouses
      tiers.tsx                      # create: /admin/tiers
      overrides.tsx                  # create: /admin/overrides
      activity.tsx                   # create: /admin/activity
    reports.tsx                      # create: /reports
    api/
      warehouses.ts                  # create: GET/POST /api/warehouses
      tiers.ts                       # create: GET/POST /api/tiers
      clients.ts                     # create: GET/POST /api/clients
      users.ts                       # create: GET/POST /api/users
      windows.ts                     # create: GET/POST /api/windows
      windows.conflicts.ts            # create: GET /api/windows/conflicts
      windows.$id.ts                  # create: GET/PATCH /api/windows/:id
      windows.$id.start.ts            # create: POST /api/windows/:id/start
      windows.$id.complete.ts         # create: POST /api/windows/:id/complete
      overrides.ts                    # create: POST /api/overrides
      overrides.$id.ts                # create: PATCH /api/overrides/:id
      reports.summary.ts              # create: GET /api/reports/summary
      reports.export.ts               # create: GET /api/reports/export (xlsx)
vitest.config.ts                     # create
package.json                         # modify: add deps, test script, seed script
```

---

## Task 1: Prisma schema — domain models + migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: migration via `npx prisma migrate dev`

**Interfaces:**
- Produces: `Role` enum (`VENTAS`, `CARGA`, `DESCARGA`, `ADMINISTRADOR`), `User.name/role/active` fields, models `Tier`, `Client`, `Warehouse`, `Window`, `OverrideRequest`, `ActivityLog`, enums `WindowStatus`, `WindowType`, `OverrideStatus`. All later tasks import the generated `@prisma/client` types for these.

- [ ] **Step 1: Replace `prisma/schema.prisma` with the full schema**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
}

enum Role {
  VENTAS
  CARGA
  DESCARGA
  ADMINISTRADOR
}

model User {
  id        Int      @id @default(autoincrement())
  email     String   @unique
  name      String   @default("")
  role      Role     @default(VENTAS)
  active    Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Tier {
  id          String   @id @default(cuid())
  name        String   @unique
  priority    Int      @unique
  description String?
  clients     Client[]
  createdAt   DateTime @default(now())
}

model Client {
  id                 String    @id @default(cuid())
  name               String
  tierId             String
  tier               Tier      @relation(fields: [tierId], references: [id])
  avgLoadTime        Int
  preferredWarehouse String?
  defaultArrivalTime String?
  active             Boolean   @default(true)
  windows            Window[]
  createdAt          DateTime  @default(now())
  updatedAt          DateTime  @updatedAt
}

model Warehouse {
  id      String   @id @default(cuid())
  name    String   @unique
  code    String   @unique
  active  Boolean  @default(true)
  windows Window[]
}

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
  actualStart     DateTime?
  actualEnd       DateTime?
  rollsCount      Int?
  delayReason     String?
  overrideRequest OverrideRequest?
  type            WindowType       @default(CARGA)
  createdBy       Int
  createdAt       DateTime         @default(now())
  updatedAt       DateTime         @updatedAt
}

enum WindowStatus {
  SCHEDULED
  IN_PROGRESS
  COMPLETED
  CANCELLED
}

enum WindowType {
  CARGA
  DESCARGA
}

model OverrideRequest {
  id          String         @id @default(cuid())
  windowId    String         @unique
  window      Window         @relation(fields: [windowId], references: [id])
  requestedBy Int
  reason      String
  status      OverrideStatus @default(PENDING)
  reviewedBy  Int?
  reviewedAt  DateTime?
  createdAt   DateTime       @default(now())
}

enum OverrideStatus {
  PENDING
  APPROVED
  REJECTED
}

model ActivityLog {
  id        String   @id @default(cuid())
  userId    Int
  action    String
  entity    String
  entityId  String?
  detail    String?
  createdAt DateTime @default(now())
}
```

- [ ] **Step 2: Generate and apply the migration**

Run: `npx prisma migrate dev --name add_shipment_window_domain`
Expected: migration created under `prisma/migrations/`, applied to the local Postgres (requires `docker-compose up -d postgres` running first), `Prisma Client` regenerated with no errors.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS (no type errors — nothing references new models yet, so this only confirms Prisma Client generation succeeded).

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: add shipment window domain models to Prisma schema"
```

---

## Task 2: Install dependencies + Vitest setup

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

**Interfaces:**
- Produces: `npm test` script (vitest run), `npm run test:watch`. Later tasks (Task 4 onward) use `vitest` for unit tests.

- [ ] **Step 1: Install runtime deps**

Run: `npm install @fullcalendar/react @fullcalendar/resource-timeline @fullcalendar/interaction @fullcalendar/core qrcode.react html-to-image exceljs date-fns`
Expected: installs cleanly, `package.json` dependencies updated.

- [ ] **Step 2: Install dev deps**

Run: `npm install -D vitest @vitejs/plugin-react jsdom`
Expected: installs cleanly.

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["app/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "~": path.resolve(__dirname, "app"),
    },
  },
});
```

- [ ] **Step 4: Add scripts to `package.json`**

Add under `"scripts"`:
```json
"test": "vitest run",
"test:watch": "vitest",
"seed": "tsx prisma/seed.ts"
```
Also run `npm install -D tsx` (needed for the `seed` script in Task 5).

- [ ] **Step 5: Verify**

Run: `npm test`
Expected: vitest runs with "No test files found" (no tests yet) — confirms config loads without error.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: add fullcalendar, qrcode, exceljs, vitest dependencies"
```

---

## Task 3: Role-aware auth helper

**Files:**
- Modify: `app/lib/session.server.ts`

**Interfaces:**
- Consumes: existing `getSession`/`requireUserId`/`logout` exports already in this file, `prisma` from `~/lib/db.server`, `Role` enum from `@prisma/client`.
- Produces: `requireUser(request: Request, allowedRoles?: Role[]): Promise<User>` — looks up the full `User` row, throws a redirect-response to `/login` (via existing `logout`) if missing/inactive, throws a redirect to `/` if `allowedRoles` is given and the user's role isn't in it. All protected page loaders and `api/*` resource routes in later tasks call this instead of `requireUserId` directly.

- [ ] **Step 1: Read the current file**

Read `app/lib/session.server.ts` in full so the appended code matches existing import style and doesn't duplicate an existing `prisma` import.

- [ ] **Step 2: Append the helper**

Add to the end of `app/lib/session.server.ts` (adjust the `prisma`/`redirect` import lines at the top of the file if they're not already present — `redirect` comes from `react-router`, `prisma` from `~/lib/db.server`, `Role` from `@prisma/client`):

```ts
import { redirect } from "react-router";
import { prisma } from "~/lib/db.server";
import type { Role, User } from "@prisma/client";

export async function requireUser(
  request: Request,
  allowedRoles?: Role[]
): Promise<User> {
  const userId = await requireUserId(request);
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.active) {
    throw await logout(request);
  }
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    throw redirect("/");
  }
  return user;
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/lib/session.server.ts
git commit -m "feat: add requireUser role-checking session helper"
```

---

## Task 4: Overlap validation logic (TDD)

**Files:**
- Create: `app/lib/validations/windowOverlap.ts`
- Test: `app/lib/validations/windowOverlap.test.ts`

**Interfaces:**
- Produces: `rangesOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean` and `findOverlappingWindow(candidate: {warehouseId: string; scheduledStart: Date; scheduledEnd: Date; excludeId?: string}, existing: Array<{id: string; warehouseId: string; scheduledStart: Date; scheduledEnd: Date; status: string}>): {id: string; warehouseId: string; scheduledStart: Date; scheduledEnd: Date} | null`. Task 12 (`api/windows.ts`) and the conflicts endpoint call `findOverlappingWindow` after fetching same-warehouse windows from Prisma; `CANCELLED` windows are excluded from the `existing` list before calling it (filtering happens at the call site, not inside this pure function).

- [ ] **Step 1: Write the failing tests**

```ts
// app/lib/validations/windowOverlap.test.ts
import { describe, it, expect } from "vitest";
import { rangesOverlap, findOverlappingWindow } from "./windowOverlap";

describe("rangesOverlap", () => {
  it("returns true when ranges overlap partially", () => {
    const a = [new Date("2026-01-01T10:00:00Z"), new Date("2026-01-01T11:00:00Z")];
    const b = [new Date("2026-01-01T10:30:00Z"), new Date("2026-01-01T11:30:00Z")];
    expect(rangesOverlap(a[0], a[1], b[0], b[1])).toBe(true);
  });

  it("returns true when one range fully contains the other", () => {
    const a = [new Date("2026-01-01T10:00:00Z"), new Date("2026-01-01T12:00:00Z")];
    const b = [new Date("2026-01-01T10:30:00Z"), new Date("2026-01-01T11:00:00Z")];
    expect(rangesOverlap(a[0], a[1], b[0], b[1])).toBe(true);
  });

  it("returns false when ranges are back-to-back with no gap", () => {
    const a = [new Date("2026-01-01T10:00:00Z"), new Date("2026-01-01T11:00:00Z")];
    const b = [new Date("2026-01-01T11:00:00Z"), new Date("2026-01-01T12:00:00Z")];
    expect(rangesOverlap(a[0], a[1], b[0], b[1])).toBe(false);
  });

  it("returns false when ranges are fully separate", () => {
    const a = [new Date("2026-01-01T10:00:00Z"), new Date("2026-01-01T11:00:00Z")];
    const b = [new Date("2026-01-01T13:00:00Z"), new Date("2026-01-01T14:00:00Z")];
    expect(rangesOverlap(a[0], a[1], b[0], b[1])).toBe(false);
  });
});

describe("findOverlappingWindow", () => {
  const existing = [
    {
      id: "w1",
      warehouseId: "wh1",
      scheduledStart: new Date("2026-01-01T10:00:00Z"),
      scheduledEnd: new Date("2026-01-01T11:00:00Z"),
      status: "SCHEDULED",
    },
  ];

  it("finds a conflict in the same warehouse", () => {
    const result = findOverlappingWindow(
      {
        warehouseId: "wh1",
        scheduledStart: new Date("2026-01-01T10:30:00Z"),
        scheduledEnd: new Date("2026-01-01T11:30:00Z"),
      },
      existing
    );
    expect(result?.id).toBe("w1");
  });

  it("ignores a different warehouse even with the same time", () => {
    const result = findOverlappingWindow(
      {
        warehouseId: "wh2",
        scheduledStart: new Date("2026-01-01T10:30:00Z"),
        scheduledEnd: new Date("2026-01-01T11:30:00Z"),
      },
      existing
    );
    expect(result).toBeNull();
  });

  it("excludes the window being edited via excludeId", () => {
    const result = findOverlappingWindow(
      {
        warehouseId: "wh1",
        scheduledStart: new Date("2026-01-01T10:30:00Z"),
        scheduledEnd: new Date("2026-01-01T11:30:00Z"),
        excludeId: "w1",
      },
      existing
    );
    expect(result).toBeNull();
  });

  it("returns null when there is no overlap", () => {
    const result = findOverlappingWindow(
      {
        warehouseId: "wh1",
        scheduledStart: new Date("2026-01-01T12:00:00Z"),
        scheduledEnd: new Date("2026-01-01T13:00:00Z"),
      },
      existing
    );
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run app/lib/validations/windowOverlap.test.ts`
Expected: FAIL with "Cannot find module './windowOverlap'" (file doesn't exist yet).

- [ ] **Step 3: Implement `app/lib/validations/windowOverlap.ts`**

```ts
export function rangesOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date
): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

export interface OverlapCandidate {
  warehouseId: string;
  scheduledStart: Date;
  scheduledEnd: Date;
  excludeId?: string;
}

export interface ExistingWindow {
  id: string;
  warehouseId: string;
  scheduledStart: Date;
  scheduledEnd: Date;
  status: string;
}

export function findOverlappingWindow(
  candidate: OverlapCandidate,
  existing: ExistingWindow[]
): ExistingWindow | null {
  for (const w of existing) {
    if (w.warehouseId !== candidate.warehouseId) continue;
    if (candidate.excludeId && w.id === candidate.excludeId) continue;
    if (
      rangesOverlap(
        candidate.scheduledStart,
        candidate.scheduledEnd,
        w.scheduledStart,
        w.scheduledEnd
      )
    ) {
      return w;
    }
  }
  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/lib/validations/windowOverlap.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add app/lib/validations/windowOverlap.ts app/lib/validations/windowOverlap.test.ts
git commit -m "feat: add window overlap validation logic with tests"
```

---

## Task 5: Seed script

**Files:**
- Create: `prisma/seed.ts`
- Modify: `prisma/schema.prisma` (add `@unique` to `Client.name`)

**Interfaces:**
- Consumes: `PrismaClient`/`PrismaPg` directly (not the `~/lib/db.server` alias — seed scripts run under `tsx` outside Vite, so resolve the alias-free import path instead).
- Produces: 4 `Warehouse` rows (codes N1–N4), 3 `Tier` rows, 5 `Client` rows, 1 `ADMINISTRADOR` `User` row. Later admin pages (Tasks 7–10) and the calendar (Task 16) expect this seed data to exist in dev.

- [ ] **Step 1: Add `@unique` to `Client.name` in `prisma/schema.prisma`**

Change `name String` to `name String @unique` in the `Client` model, then run:

Run: `npx prisma migrate dev --name client_name_unique`
Expected: new migration applied with no errors (table is empty so no conflict).

- [ ] **Step 2: Create `prisma/seed.ts`**

```ts
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const warehouses = await Promise.all(
    [1, 2, 3, 4].map((n) =>
      prisma.warehouse.upsert({
        where: { code: `N${n}` },
        update: {},
        create: { name: `Nave ${n}`, code: `N${n}` },
      })
    )
  );

  const tiers = await Promise.all([
    prisma.tier.upsert({
      where: { name: "Tier 1" },
      update: {},
      create: { name: "Tier 1", priority: 1, description: "Clientes prioritarios" },
    }),
    prisma.tier.upsert({
      where: { name: "Tier 2" },
      update: {},
      create: { name: "Tier 2", priority: 2, description: "Clientes regulares" },
    }),
    prisma.tier.upsert({
      where: { name: "Tier 3" },
      update: {},
      create: { name: "Tier 3", priority: 3, description: "Clientes ocasionales" },
    }),
  ]);

  const clientSeeds = [
    { name: "Acero del Norte", tier: tiers[0], avgLoadTime: 60, preferredWarehouse: warehouses[0].id, defaultArrivalTime: "08:00" },
    { name: "Textiles Monterrey", tier: tiers[0], avgLoadTime: 45, preferredWarehouse: warehouses[1].id, defaultArrivalTime: "09:00" },
    { name: "Distribuidora Sureste", tier: tiers[1], avgLoadTime: 90, preferredWarehouse: warehouses[2].id, defaultArrivalTime: "10:00" },
    { name: "Logística Bajío", tier: tiers[1], avgLoadTime: 30, preferredWarehouse: warehouses[3].id, defaultArrivalTime: "11:00" },
    { name: "Comercial Pacífico", tier: tiers[2], avgLoadTime: 75, preferredWarehouse: warehouses[0].id, defaultArrivalTime: "13:00" },
  ];

  for (const c of clientSeeds) {
    await prisma.client.upsert({
      where: { name: c.name },
      update: {},
      create: {
        name: c.name,
        tierId: c.tier.id,
        avgLoadTime: c.avgLoadTime,
        preferredWarehouse: c.preferredWarehouse,
        defaultArrivalTime: c.defaultArrivalTime,
      },
    });
  }

  await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: { role: "ADMINISTRADOR", active: true },
    create: { email: "admin@example.com", name: "Administrador", role: "ADMINISTRADOR" },
  });

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 3: Run the seed**

Run: `npm run seed`
Expected: prints "Seed complete." with no errors; `SELECT * FROM "Warehouse"` shows 4 rows.

- [ ] **Step 4: Commit**

```bash
git add prisma/seed.ts prisma/schema.prisma prisma/migrations package.json
git commit -m "feat: add database seed script"
```

---

## Task 6: Install ShadCN components

**Files:**
- Create: `app/components/ui/*` (via CLI, not hand-written)

**Interfaces:**
- Produces: ShadCN primitives imported by every later UI task: `Button`, `Input`, `Label`, `Select`, `Dialog`, `Table`, `Card`, `Badge`, `Form`, `Sonner` (toast), `Skeleton`, `DropdownMenu`, `Tabs`, `Textarea`, `Alert`, `Popover`, `Calendar`.

- [ ] **Step 1: Run the shadcn CLI for each component**

Run: `npx shadcn add button input label select dialog table card badge form sonner skeleton dropdown-menu tabs textarea alert popover calendar`
Expected: files created under `app/components/ui/`, `components.json` aliases respected, no errors. If the CLI prompts for confirmation, accept defaults (matches existing `radix-nova` style/`neutral` base already configured).

- [ ] **Step 2: Add the `<Toaster />` to the root layout**

Read `app/root.tsx`, then add `import { Toaster } from "~/components/ui/sonner";` and render `<Toaster />` once inside the root `<body>` (sibling to `<Outlet />`), so `toast()` calls from any page work app-wide.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/components/ui app/root.tsx
git commit -m "chore: install shadcn ui primitives"
```

---

## Task 7: Warehouses CRUD (API + admin page)

**Files:**
- Create: `app/routes/api/warehouses.ts`
- Create: `app/routes/admin/layout.tsx`
- Create: `app/routes/admin/warehouses.tsx`
- Modify: `app/routes.ts`

**Interfaces:**
- Consumes: `requireUser` from `~/lib/session.server`, `prisma` from `~/lib/db.server`.
- Produces: `GET /api/warehouses` → `Warehouse[]` JSON; `POST /api/warehouses` → creates one, body `{name: string; code: string}`. `/admin` layout route guards all `/admin/*` children with `requireUser(request, ["ADMINISTRADOR"])`. Later tasks (8, 9, 10, 17, 18) add siblings under the same `/admin` layout and reuse this exact guard pattern.

- [ ] **Step 1: Create the admin layout guard**

```tsx
// app/routes/admin/layout.tsx
import { Outlet } from "react-router";
import type { Route } from "./+types/layout";
import { requireUser } from "~/lib/session.server";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request, ["ADMINISTRADOR"]);
  return { user };
}

export default function AdminLayout() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Administración</h1>
      <Outlet />
    </div>
  );
}
```

- [ ] **Step 2: Create the warehouses resource route**

```ts
// app/routes/api/warehouses.ts
import type { Route } from "./+types/warehouses";
import { requireUser } from "~/lib/session.server";
import { prisma } from "~/lib/db.server";

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request);
  const warehouses = await prisma.warehouse.findMany({ orderBy: { name: "asc" } });
  return Response.json(warehouses);
}

export async function action({ request }: Route.ActionArgs) {
  await requireUser(request, ["ADMINISTRADOR"]);
  const body = await request.json();
  const warehouse = await prisma.warehouse.create({
    data: { name: body.name, code: body.code },
  });
  return Response.json(warehouse, { status: 201 });
}
```

- [ ] **Step 3: Create the admin warehouses page**

```tsx
// app/routes/admin/warehouses.tsx
import { useState } from "react";
import { Form, useLoaderData, useNavigate } from "react-router";
import type { Route } from "./+types/warehouses";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { toast } from "sonner";

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request, ["ADMINISTRADOR"]);
  const warehouses = await prisma.warehouse.findMany({ orderBy: { name: "asc" } });
  return { warehouses };
}

export default function WarehousesAdmin({ loaderData }: Route.ComponentProps) {
  const { warehouses } = loaderData;
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");

  async function handleCreate() {
    const res = await fetch("/api/warehouses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, code }),
    });
    if (!res.ok) {
      toast.error("No se pudo crear la nave");
      return;
    }
    toast.success("Nave creada");
    setOpen(false);
    setName("");
    setCode("");
    navigate(".", { replace: true });
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Naves</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>Nueva nave</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nueva nave</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="name">Nombre</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="code">Código</Label>
                <Input id="code" value={code} onChange={(e) => setCode(e.target.value)} />
              </div>
              <Button onClick={handleCreate} disabled={!name || !code}>
                Guardar
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>Código</TableHead>
            <TableHead>Activa</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {warehouses.map((w) => (
            <TableRow key={w.id}>
              <TableCell>{w.name}</TableCell>
              <TableCell>{w.code}</TableCell>
              <TableCell>{w.active ? "Sí" : "No"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 4: Register the routes in `app/routes.ts`**

Read `app/routes.ts`, then add inside the array (alongside the existing `dashboard` layout block, as a new top-level layout) and a top-level `route` for the API:

```ts
layout("./routes/admin/layout.tsx", [
  route("admin/warehouses", "./routes/admin/warehouses.tsx"),
]),
route("api/warehouses", "./routes/api/warehouses.ts"),
```

(Subsequent tasks append more `route(...)` lines into this same `admin` layout's children array and add more top-level `api/*` routes — don't duplicate the `layout(...)` wrapper.)

- [ ] **Step 5: Manual verification**

Run: `npm run dev`, log in as `admin@example.com` (requires Entra ID test login or temporarily seeding a session — note for Task 22's full smoke test), visit `/admin/warehouses`, confirm the 4 seeded naves list and that creating a 5th nave works and appears after dialog closes.

- [ ] **Step 6: Typecheck and commit**

Run: `npm run typecheck` — Expected: PASS.

```bash
git add app/routes/api/warehouses.ts app/routes/admin/layout.tsx app/routes/admin/warehouses.tsx app/routes.ts
git commit -m "feat: add warehouse CRUD admin page and API"
```

---

## Task 8: Tiers CRUD (API + admin page)

**Files:**
- Create: `app/routes/api/tiers.ts`
- Create: `app/routes/admin/tiers.tsx`
- Modify: `app/routes.ts`

**Interfaces:**
- Consumes: same `requireUser`/`prisma` pattern as Task 7.
- Produces: `GET /api/tiers` → `Tier[]`; `POST /api/tiers` → body `{name, priority, description?}`. Task 9 (`Client` admin page) fetches `/api/tiers` to populate the tier `<Select>`.

- [ ] **Step 1: Create the tiers resource route**

```ts
// app/routes/api/tiers.ts
import type { Route } from "./+types/tiers";
import { requireUser } from "~/lib/session.server";
import { prisma } from "~/lib/db.server";

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request);
  const tiers = await prisma.tier.findMany({ orderBy: { priority: "asc" } });
  return Response.json(tiers);
}

export async function action({ request }: Route.ActionArgs) {
  await requireUser(request, ["ADMINISTRADOR"]);
  const body = await request.json();
  const tier = await prisma.tier.create({
    data: { name: body.name, priority: body.priority, description: body.description ?? null },
  });
  return Response.json(tier, { status: 201 });
}
```

- [ ] **Step 2: Create the admin tiers page**

```tsx
// app/routes/admin/tiers.tsx
import { useState } from "react";
import { useNavigate } from "react-router";
import type { Route } from "./+types/tiers";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { toast } from "sonner";

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request, ["ADMINISTRADOR"]);
  const tiers = await prisma.tier.findMany({ orderBy: { priority: "asc" } });
  return { tiers };
}

export default function TiersAdmin({ loaderData }: Route.ComponentProps) {
  const { tiers } = loaderData;
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [priority, setPriority] = useState("");
  const [description, setDescription] = useState("");

  async function handleCreate() {
    const res = await fetch("/api/tiers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, priority: Number(priority), description }),
    });
    if (!res.ok) {
      toast.error("No se pudo crear el tier");
      return;
    }
    toast.success("Tier creado");
    setOpen(false);
    setName("");
    setPriority("");
    setDescription("");
    navigate(".", { replace: true });
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Tiers</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>Nuevo tier</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nuevo tier</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="name">Nombre</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="priority">Prioridad (1 = mayor)</Label>
                <Input
                  id="priority"
                  type="number"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="description">Descripción</Label>
                <Input
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <Button onClick={handleCreate} disabled={!name || !priority}>
                Guardar
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>Prioridad</TableHead>
            <TableHead>Descripción</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tiers.map((t) => (
            <TableRow key={t.id}>
              <TableCell>{t.name}</TableCell>
              <TableCell>{t.priority}</TableCell>
              <TableCell>{t.description}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 3: Register routes in `app/routes.ts`**

Add `route("admin/tiers", "./routes/admin/tiers.tsx")` inside the existing `admin` layout's children array, and `route("api/tiers", "./routes/api/tiers.ts")` as a top-level route.

- [ ] **Step 4: Typecheck and commit**

Run: `npm run typecheck` — Expected: PASS.

```bash
git add app/routes/api/tiers.ts app/routes/admin/tiers.tsx app/routes.ts
git commit -m "feat: add tier CRUD admin page and API"
```

---

## Task 9: Clients CRUD (API + admin page)

**Files:**
- Create: `app/routes/api/clients.ts`
- Create: `app/routes/admin/clients.tsx`
- Modify: `app/routes.ts`

**Interfaces:**
- Consumes: `requireUser`/`prisma`; fetches `/api/tiers` and `/api/warehouses` client-side to populate selects.
- Produces: `GET /api/clients` → `Client[]` (with `tier` included); `POST /api/clients` → body `{name, tierId, avgLoadTime, preferredWarehouse?, defaultArrivalTime?}`. Task 14 (`/windows/new`) fetches `/api/clients` to populate the client picker and reads `avgLoadTime`/`tier`/`defaultArrivalTime` off each entry.

- [ ] **Step 1: Create the clients resource route**

```ts
// app/routes/api/clients.ts
import type { Route } from "./+types/clients";
import { requireUser } from "~/lib/session.server";
import { prisma } from "~/lib/db.server";

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request);
  const clients = await prisma.client.findMany({
    where: { active: true },
    include: { tier: true },
    orderBy: { name: "asc" },
  });
  return Response.json(clients);
}

export async function action({ request }: Route.ActionArgs) {
  await requireUser(request, ["ADMINISTRADOR"]);
  const body = await request.json();
  const client = await prisma.client.create({
    data: {
      name: body.name,
      tierId: body.tierId,
      avgLoadTime: Number(body.avgLoadTime),
      preferredWarehouse: body.preferredWarehouse ?? null,
      defaultArrivalTime: body.defaultArrivalTime ?? null,
    },
  });
  return Response.json(client, { status: 201 });
}
```

- [ ] **Step 2: Create the admin clients page**

```tsx
// app/routes/admin/clients.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import type { Route } from "./+types/clients";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { toast } from "sonner";
import type { Tier } from "@prisma/client";

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request, ["ADMINISTRADOR"]);
  const clients = await prisma.client.findMany({
    include: { tier: true },
    orderBy: { name: "asc" },
  });
  return { clients };
}

export default function ClientsAdmin({ loaderData }: Route.ComponentProps) {
  const { clients } = loaderData;
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [name, setName] = useState("");
  const [tierId, setTierId] = useState("");
  const [avgLoadTime, setAvgLoadTime] = useState("");

  useEffect(() => {
    if (open) {
      fetch("/api/tiers")
        .then((r) => r.json())
        .then(setTiers);
    }
  }, [open]);

  async function handleCreate() {
    const res = await fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, tierId, avgLoadTime }),
    });
    if (!res.ok) {
      toast.error("No se pudo crear el cliente");
      return;
    }
    toast.success("Cliente creado");
    setOpen(false);
    setName("");
    setTierId("");
    setAvgLoadTime("");
    navigate(".", { replace: true });
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Clientes</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>Nuevo cliente</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nuevo cliente</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="name">Nombre</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Tier</Label>
                <Select value={tierId} onValueChange={setTierId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona un tier" />
                  </SelectTrigger>
                  <SelectContent>
                    {tiers.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="avgLoadTime">Tiempo promedio (minutos)</Label>
                <Input
                  id="avgLoadTime"
                  type="number"
                  value={avgLoadTime}
                  onChange={(e) => setAvgLoadTime(e.target.value)}
                />
              </div>
              <Button onClick={handleCreate} disabled={!name || !tierId || !avgLoadTime}>
                Guardar
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>Tier</TableHead>
            <TableHead>Tiempo promedio</TableHead>
            <TableHead>Activo</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {clients.map((c) => (
            <TableRow key={c.id}>
              <TableCell>{c.name}</TableCell>
              <TableCell>{c.tier.name}</TableCell>
              <TableCell>{c.avgLoadTime} min</TableCell>
              <TableCell>{c.active ? "Sí" : "No"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 3: Register routes in `app/routes.ts`**

Add `route("admin/clients", "./routes/admin/clients.tsx")` inside the `admin` layout's children, and `route("api/clients", "./routes/api/clients.ts")` as a top-level route.

- [ ] **Step 4: Typecheck and commit**

Run: `npm run typecheck` — Expected: PASS.

```bash
git add app/routes/api/clients.ts app/routes/admin/clients.tsx app/routes.ts
git commit -m "feat: add client CRUD admin page and API"
```

---

## Task 10: Users CRUD (API + admin page)

**Files:**
- Create: `app/routes/api/users.ts`
- Create: `app/routes/admin/users.tsx`
- Modify: `app/routes.ts`

**Interfaces:**
- Consumes: `requireUser`/`prisma`.
- Produces: `GET /api/users` → `User[]`; `POST /api/users` → body `{email, name, role}` (creates a pre-provisioned user who can self-register via Entra ID login later, matching the existing `findOrCreateUser(email)` flow in `app/services/auth-server.ts` which looks up by email). `PATCH` isn't needed as a separate resource route — role/active toggles happen inline via a `PATCH /api/users/:id`-style action on the same route using a `?id=` search param to keep this a single resource route, OR (simpler, chosen here) edits go through `action` on this same `/api/users` route keyed by `body.id` with a `method: "PATCH"`.

- [ ] **Step 1: Create the users resource route**

```ts
// app/routes/api/users.ts
import type { Route } from "./+types/users";
import { requireUser } from "~/lib/session.server";
import { prisma } from "~/lib/db.server";

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request, ["ADMINISTRADOR"]);
  const users = await prisma.user.findMany({ orderBy: { name: "asc" } });
  return Response.json(users);
}

export async function action({ request }: Route.ActionArgs) {
  await requireUser(request, ["ADMINISTRADOR"]);
  if (request.method === "PATCH") {
    const body = await request.json();
    const user = await prisma.user.update({
      where: { id: Number(body.id) },
      data: { role: body.role, active: body.active },
    });
    return Response.json(user);
  }
  const body = await request.json();
  const user = await prisma.user.create({
    data: { email: body.email, name: body.name, role: body.role },
  });
  return Response.json(user, { status: 201 });
}
```

- [ ] **Step 2: Create the admin users page**

```tsx
// app/routes/admin/users.tsx
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { toast } from "sonner";

const ROLES = ["VENTAS", "CARGA", "DESCARGA", "ADMINISTRADOR"] as const;

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request, ["ADMINISTRADOR"]);
  const users = await prisma.user.findMany({ orderBy: { name: "asc" } });
  return { users };
}

export default function UsersAdmin({ loaderData }: Route.ComponentProps) {
  const { users } = loaderData;
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<string>("VENTAS");

  async function handleCreate() {
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name, role }),
    });
    if (!res.ok) {
      toast.error("No se pudo crear el usuario");
      return;
    }
    toast.success("Usuario creado");
    setOpen(false);
    setEmail("");
    setName("");
    setRole("VENTAS");
    navigate(".", { replace: true });
  }

  async function toggleActive(id: number, active: boolean) {
    const res = await fetch("/api/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, active: !active }),
    });
    if (!res.ok) {
      toast.error("No se pudo actualizar el usuario");
      return;
    }
    navigate(".", { replace: true });
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Usuarios</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>Nuevo usuario</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nuevo usuario</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="email">Correo</Label>
                <Input id="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="name">Nombre</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Rol</Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleCreate} disabled={!email || !name}>
                Guardar
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>Correo</TableHead>
            <TableHead>Rol</TableHead>
            <TableHead>Activo</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((u) => (
            <TableRow key={u.id}>
              <TableCell>{u.name}</TableCell>
              <TableCell>{u.email}</TableCell>
              <TableCell>{u.role}</TableCell>
              <TableCell>{u.active ? "Sí" : "No"}</TableCell>
              <TableCell>
                <Button variant="outline" size="sm" onClick={() => toggleActive(u.id, u.active)}>
                  {u.active ? "Desactivar" : "Activar"}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 3: Register routes in `app/routes.ts`**

Add `route("admin/users", "./routes/admin/users.tsx")` inside the `admin` layout's children, and `route("api/users", "./routes/api/users.ts")` as a top-level route.

- [ ] **Step 4: Typecheck and commit**

Run: `npm run typecheck` — Expected: PASS.

```bash
git add app/routes/api/users.ts app/routes/admin/users.tsx app/routes.ts
git commit -m "feat: add user CRUD admin page and API"
```

---

## Task 11: QR code generation (lib + dialog component)

**Files:**
- Create: `app/lib/qr.ts`
- Create: `app/components/qr/WindowQrDialog.tsx`

**Interfaces:**
- Produces: `buildQrPayload(window: {client: {name: string}; operatorName: string; licensePlate: string; warehouse: {name: string}; scheduledStart: Date; scheduledEnd: Date; id: string}): string` — the structured text payload. `<WindowQrDialog open, onOpenChange, window>` component renders the QR (via `qrcode.react`'s `QRCodeCanvas`) and a "Descargar PNG" button using `html-to-image`. Task 14 (`/windows/new`) renders this dialog after a successful create; Task 15 (`/windows/:id`) renders it inline if `window.qrCode` is set.

- [ ] **Step 1: Create `app/lib/qr.ts`**

```ts
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
```

- [ ] **Step 2: Create `app/components/qr/WindowQrDialog.tsx`**

```tsx
import { useRef } from "react";
import { toPng } from "html-to-image";
import { QRCodeCanvas } from "qrcode.react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import { buildQrPayload, type QrWindowData } from "~/lib/qr";

export function WindowQrDialog({
  open,
  onOpenChange,
  window: windowData,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  window: QrWindowData;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  async function handleDownload() {
    if (!containerRef.current) return;
    const dataUrl = await toPng(containerRef.current);
    const link = document.createElement("a");
    link.download = `ventana-${windowData.id}.png`;
    link.href = dataUrl;
    link.click();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Código QR de la ventana</DialogTitle>
        </DialogHeader>
        <div ref={containerRef} className="flex flex-col items-center gap-3 bg-white p-4">
          <QRCodeCanvas value={buildQrPayload(windowData)} size={220} />
          <p className="text-sm text-center whitespace-pre-line">
            {buildQrPayload(windowData)}
          </p>
        </div>
        <Button onClick={handleDownload}>Descargar PNG</Button>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Typecheck and commit**

Run: `npm run typecheck` — Expected: PASS.

```bash
git add app/lib/qr.ts app/components/qr/WindowQrDialog.tsx
git commit -m "feat: add QR code generation for windows"
```

---

## Task 12: Activity log helper + Windows list/create API + conflicts endpoint

**Files:**
- Create: `app/lib/activity.server.ts`
- Create: `app/routes/api/windows.ts`
- Create: `app/routes/api/windows.conflicts.ts`
- Modify: `app/routes.ts`

**Interfaces:**
- Consumes: `findOverlappingWindow` from `~/lib/validations/windowOverlap` (Task 4), `requireUser`, `prisma`, `buildQrPayload` is NOT called here (QR text is generated client-side in Task 11's dialog; the `qrCode` DB column stores the same payload string for later display in Task 15).
- Produces: `logActivity({userId, action, entity, entityId?, detail?}): Promise<void>`, used by every mutating route from here on (windows, overrides). `POST /api/windows` → body `{clientId, warehouseId, scheduledStart (ISO), operatorName, licensePlate, type}`, computes `scheduledEnd` server-side from `client.avgLoadTime`, returns `409` with `{conflict: {...}}` if overlapping, else `201` with the created `Window` (including `client`/`warehouse` relations) and a `qrPayload` string. `GET /api/windows?date=YYYY-MM-DD` → `Window[]` for the calendar (Task 16). `GET /api/windows/conflicts?warehouseId&start&end&excludeId?` → `{conflict: Window | null}`, used by Task 14's real-time conflict check.

- [ ] **Step 1: Create `app/lib/activity.server.ts`**

```ts
import { prisma } from "~/lib/db.server";

export async function logActivity(params: {
  userId: number;
  action: string;
  entity: string;
  entityId?: string;
  detail?: string;
}): Promise<void> {
  await prisma.activityLog.create({
    data: {
      userId: params.userId,
      action: params.action,
      entity: params.entity,
      entityId: params.entityId ?? null,
      detail: params.detail ?? null,
    },
  });
}
```

- [ ] **Step 2: Create `app/routes/api/windows.ts`**

```ts
// app/routes/api/windows.ts
import type { Route } from "./+types/windows";
import { requireUser } from "~/lib/session.server";
import { prisma } from "~/lib/db.server";
import { logActivity } from "~/lib/activity.server";
import { findOverlappingWindow } from "~/lib/validations/windowOverlap";
import { buildQrPayload } from "~/lib/qr";

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request);
  const url = new URL(request.url);
  const date = url.searchParams.get("date");
  const where = date
    ? {
        scheduledStart: {
          gte: new Date(`${date}T00:00:00`),
          lt: new Date(`${date}T23:59:59`),
        },
      }
    : {};
  const windows = await prisma.window.findMany({
    where,
    include: { client: { include: { tier: true } }, warehouse: true },
    orderBy: { scheduledStart: "asc" },
  });
  return Response.json(windows);
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireUser(request, ["VENTAS", "ADMINISTRADOR"]);
  const body = await request.json();

  const client = await prisma.client.findUniqueOrThrow({ where: { id: body.clientId } });
  const scheduledStart = new Date(body.scheduledStart);
  const scheduledEnd = new Date(scheduledStart.getTime() + client.avgLoadTime * 60000);

  const sameWarehouseWindows = await prisma.window.findMany({
    where: { warehouseId: body.warehouseId, status: { not: "CANCELLED" } },
  });
  const conflict = findOverlappingWindow(
    { warehouseId: body.warehouseId, scheduledStart, scheduledEnd },
    sameWarehouseWindows
  );
  if (conflict) {
    const conflictWindow = await prisma.window.findUnique({
      where: { id: conflict.id },
      include: { client: true },
    });
    return Response.json({ conflict: conflictWindow }, { status: 409 });
  }

  const window = await prisma.window.create({
    data: {
      clientId: body.clientId,
      warehouseId: body.warehouseId,
      scheduledStart,
      scheduledEnd,
      operatorName: body.operatorName,
      licensePlate: body.licensePlate,
      type: body.type ?? "CARGA",
      createdBy: user.id,
    },
    include: { client: true, warehouse: true },
  });

  const qrPayload = buildQrPayload(window);
  const updated = await prisma.window.update({
    where: { id: window.id },
    data: { qrCode: qrPayload },
    include: { client: true, warehouse: true },
  });

  await logActivity({
    userId: user.id,
    action: "CREATE",
    entity: "Window",
    entityId: window.id,
    detail: `Ventana creada para ${client.name}`,
  });

  return Response.json({ window: updated, qrPayload }, { status: 201 });
}
```

- [ ] **Step 3: Create `app/routes/api/windows.conflicts.ts`**

```ts
// app/routes/api/windows.conflicts.ts
import type { Route } from "./+types/windows.conflicts";
import { requireUser } from "~/lib/session.server";
import { prisma } from "~/lib/db.server";
import { findOverlappingWindow } from "~/lib/validations/windowOverlap";

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request);
  const url = new URL(request.url);
  const warehouseId = url.searchParams.get("warehouseId");
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");
  const excludeId = url.searchParams.get("excludeId") ?? undefined;

  if (!warehouseId || !start || !end) {
    return Response.json({ conflict: null });
  }

  const sameWarehouseWindows = await prisma.window.findMany({
    where: { warehouseId, status: { not: "CANCELLED" } },
  });
  const conflict = findOverlappingWindow(
    {
      warehouseId,
      scheduledStart: new Date(start),
      scheduledEnd: new Date(end),
      excludeId,
    },
    sameWarehouseWindows
  );

  if (!conflict) return Response.json({ conflict: null });

  const conflictWindow = await prisma.window.findUnique({
    where: { id: conflict.id },
    include: { client: { include: { tier: true } } },
  });
  return Response.json({ conflict: conflictWindow });
}
```

- [ ] **Step 4: Register routes in `app/routes.ts`**

Add as top-level routes: `route("api/windows", "./routes/api/windows.ts")` and `route("api/windows/conflicts", "./routes/api/windows.conflicts.ts")`.

- [ ] **Step 5: Typecheck and commit**

Run: `npm run typecheck` — Expected: PASS.

```bash
git add app/lib/activity.server.ts app/routes/api/windows.ts app/routes/api/windows.conflicts.ts app/routes.ts
git commit -m "feat: add windows list/create API with overlap validation"
```

---

## Task 13: Windows detail/start/complete API

**Files:**
- Create: `app/routes/api/windows.$id.ts`
- Create: `app/routes/api/windows.$id.start.ts`
- Create: `app/routes/api/windows.$id.complete.ts`
- Modify: `app/routes.ts`

**Interfaces:**
- Consumes: `requireUser`, `prisma`, `logActivity` (Task 12).
- Produces: `GET /api/windows/:id` → single `Window` with `client`/`warehouse`/`overrideRequest`; `PATCH /api/windows/:id` → admin-only field edits (`status`, or full reschedule — out of scope beyond status here per spec, which only requires admin "editar o eliminar cualquier ventana"; this PATCH accepts `{status}` for cancel/delete-equivalent and full field edits via the same body shape as create). `POST /api/windows/:id/start` → sets `status: IN_PROGRESS`, `actualStart: now`. `POST /api/windows/:id/complete` → body `{rollsCount: number; delayReason?: string}`, sets `status: COMPLETED`, `actualEnd: now`; if `actualEnd - actualStart > client.avgLoadTime` (minutes) and `delayReason` is missing, returns `400` with `{error: "delay_reason_required"}`. Task 15 (`/windows/:id` page) calls all three of these.

- [ ] **Step 1: Create `app/routes/api/windows.$id.ts`**

```ts
// app/routes/api/windows.$id.ts
import type { Route } from "./+types/windows.$id";
import { requireUser } from "~/lib/session.server";
import { prisma } from "~/lib/db.server";
import { logActivity } from "~/lib/activity.server";

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireUser(request);
  const window = await prisma.window.findUniqueOrThrow({
    where: { id: params.id },
    include: { client: { include: { tier: true } }, warehouse: true, overrideRequest: true },
  });
  return Response.json(window);
}

export async function action({ request, params }: Route.ActionArgs) {
  const user = await requireUser(request, ["ADMINISTRADOR"]);
  const body = await request.json();
  const window = await prisma.window.update({
    where: { id: params.id },
    data: { status: body.status },
    include: { client: true, warehouse: true },
  });
  await logActivity({
    userId: user.id,
    action: "UPDATE",
    entity: "Window",
    entityId: window.id,
    detail: `Estado actualizado a ${body.status}`,
  });
  return Response.json(window);
}
```

- [ ] **Step 2: Create `app/routes/api/windows.$id.start.ts`**

```ts
// app/routes/api/windows.$id.start.ts
import type { Route } from "./+types/windows.$id.start";
import { requireUser } from "~/lib/session.server";
import { prisma } from "~/lib/db.server";
import { logActivity } from "~/lib/activity.server";

export async function action({ request, params }: Route.ActionArgs) {
  const user = await requireUser(request, ["CARGA", "DESCARGA", "ADMINISTRADOR"]);
  const window = await prisma.window.update({
    where: { id: params.id },
    data: { status: "IN_PROGRESS", actualStart: new Date() },
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

- [ ] **Step 3: Create `app/routes/api/windows.$id.complete.ts`**

```ts
// app/routes/api/windows.$id.complete.ts
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

  if (actualMinutes > existing.client.avgLoadTime && !body.delayReason) {
    return Response.json({ error: "delay_reason_required" }, { status: 400 });
  }

  const window = await prisma.window.update({
    where: { id: params.id },
    data: {
      status: "COMPLETED",
      actualEnd,
      rollsCount: Number(body.rollsCount),
      delayReason: body.delayReason ?? null,
    },
  });

  await logActivity({
    userId: user.id,
    action: "COMPLETE",
    entity: "Window",
    entityId: window.id,
    detail: body.delayReason ? `Retraso: ${body.delayReason}` : undefined,
  });

  return Response.json(window);
}
```

- [ ] **Step 4: Register routes in `app/routes.ts`**

Add as top-level routes: `route("api/windows/:id", "./routes/api/windows.$id.ts")`, `route("api/windows/:id/start", "./routes/api/windows.$id.start.ts")`, `route("api/windows/:id/complete", "./routes/api/windows.$id.complete.ts")`.

- [ ] **Step 5: Typecheck and commit**

Run: `npm run typecheck` — Expected: PASS.

```bash
git add app/routes/api/windows.\$id.ts app/routes/api/windows.\$id.start.ts app/routes/api/windows.\$id.complete.ts app/routes.ts
git commit -m "feat: add window detail, start, and complete API endpoints"
```

---

## Task 14: Overrides API + `/windows/new` page

**Files:**
- Create: `app/routes/api/overrides.ts`
- Create: `app/routes/windows/new.tsx`
- Modify: `app/routes.ts`

**Interfaces:**
- Consumes: `requireUser`, `prisma`, `logActivity`, `GET /api/clients`, `GET /api/warehouses`, `GET /api/windows/conflicts`, `POST /api/windows`, `WindowQrDialog` (Task 11).
- Produces: `POST /api/overrides` → body `{windowDraft: {...same as POST /api/windows body...}, reason}` — since the window doesn't exist yet when a conflict is hit, the override request stores the *intended* window fields as JSON in `reason`-adjacent `detail`-style text rather than a real `windowId` (the schema's `OverrideRequest.windowId` is `@unique` and non-nullable, so an override can only reference an *existing* window). To satisfy this schema constraint: the create flow first creates the `Window` row with `status: SCHEDULED` even when conflicting is NOT how this works per spec ("antes de guardar" = check before saving) — instead, **override requests are only created from already-saved conflicting attempts is not possible**, so this task changes the approach: the override request endpoint creates the window placeholder is rejected. Resolved design: `POST /api/overrides` takes `{warehouseId, clientId, scheduledStart, operatorName, licensePlate, type, reason}`, creates the `Window` row directly with `status: SCHEDULED` bypassing the overlap check (admin override path), AND creates a linked `OverrideRequest` with `status: PENDING` referencing that window's id. The admin then approves/rejects via Task 17; rejection sets the window's status to `CANCELLED` (not deleted, to preserve the audit trail).

- [ ] **Step 1: Create `app/routes/api/overrides.ts`**

```ts
// app/routes/api/overrides.ts
import type { Route } from "./+types/overrides";
import { requireUser } from "~/lib/session.server";
import { prisma } from "~/lib/db.server";
import { logActivity } from "~/lib/activity.server";
import { buildQrPayload } from "~/lib/qr";

export async function action({ request }: Route.ActionArgs) {
  const user = await requireUser(request, ["VENTAS", "ADMINISTRADOR"]);
  const body = await request.json();

  const client = await prisma.client.findUniqueOrThrow({ where: { id: body.clientId } });
  const scheduledStart = new Date(body.scheduledStart);
  const scheduledEnd = new Date(scheduledStart.getTime() + client.avgLoadTime * 60000);

  const window = await prisma.window.create({
    data: {
      clientId: body.clientId,
      warehouseId: body.warehouseId,
      scheduledStart,
      scheduledEnd,
      operatorName: body.operatorName,
      licensePlate: body.licensePlate,
      type: body.type ?? "CARGA",
      createdBy: user.id,
    },
    include: { client: true, warehouse: true },
  });
  await prisma.window.update({
    where: { id: window.id },
    data: { qrCode: buildQrPayload(window) },
  });

  const overrideRequest = await prisma.overrideRequest.create({
    data: { windowId: window.id, requestedBy: user.id, reason: body.reason },
  });

  await logActivity({
    userId: user.id,
    action: "REQUEST_OVERRIDE",
    entity: "Window",
    entityId: window.id,
    detail: body.reason,
  });

  return Response.json({ window, overrideRequest }, { status: 201 });
}
```

- [ ] **Step 2: Create `app/routes/windows/new.tsx`**

```tsx
// app/routes/windows/new.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import type { Route } from "./+types/new";
import { requireUser } from "~/lib/session.server";
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
import { Alert, AlertTitle, AlertDescription } from "~/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Textarea } from "~/components/ui/textarea";
import { WindowQrDialog } from "~/components/qr/WindowQrDialog";
import { toast } from "sonner";
import { addMinutes, format } from "date-fns";

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request, ["VENTAS", "ADMINISTRADOR"]);
  return {};
}

interface ClientOption {
  id: string;
  name: string;
  avgLoadTime: number;
  defaultArrivalTime: string | null;
  tier: { name: string; priority: number };
}
interface WarehouseOption {
  id: string;
  name: string;
}

export default function NewWindow() {
  const navigate = useNavigate();
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [clientId, setClientId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [operatorName, setOperatorName] = useState("");
  const [licensePlate, setLicensePlate] = useState("");
  const [conflict, setConflict] = useState<any>(null);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [qrOpen, setQrOpen] = useState(false);
  const [createdWindow, setCreatedWindow] = useState<any>(null);

  useEffect(() => {
    fetch("/api/clients").then((r) => r.json()).then(setClients);
    fetch("/api/warehouses").then((r) => r.json()).then(setWarehouses);
  }, []);

  const selectedClient = clients.find((c) => c.id === clientId);
  const start = date && time ? new Date(`${date}T${time}`) : null;
  const end = start && selectedClient ? addMinutes(start, selectedClient.avgLoadTime) : null;

  useEffect(() => {
    if (selectedClient?.defaultArrivalTime && !time) {
      setTime(selectedClient.defaultArrivalTime);
    }
  }, [selectedClient]);

  useEffect(() => {
    if (!warehouseId || !start || !end) {
      setConflict(null);
      return;
    }
    const params = new URLSearchParams({
      warehouseId,
      start: start.toISOString(),
      end: end.toISOString(),
    });
    fetch(`/api/windows/conflicts?${params}`)
      .then((r) => r.json())
      .then((data) => setConflict(data.conflict));
  }, [warehouseId, start?.getTime(), end?.getTime()]);

  async function handleSubmit() {
    if (!clientId || !warehouseId || !start) return;
    const res = await fetch("/api/windows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId,
        warehouseId,
        scheduledStart: start.toISOString(),
        operatorName,
        licensePlate,
      }),
    });
    if (res.status === 409) {
      const data = await res.json();
      setConflict(data.conflict);
      toast.error("Existe un conflicto de horario en esta nave");
      return;
    }
    if (!res.ok) {
      toast.error("No se pudo crear la ventana");
      return;
    }
    const data = await res.json();
    setCreatedWindow(data.window);
    setQrOpen(true);
    toast.success("Ventana creada");
  }

  async function handleOverrideRequest() {
    if (!clientId || !warehouseId || !start) return;
    const res = await fetch("/api/overrides", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId,
        warehouseId,
        scheduledStart: start.toISOString(),
        operatorName,
        licensePlate,
        reason: overrideReason,
      }),
    });
    if (!res.ok) {
      toast.error("No se pudo enviar la solicitud");
      return;
    }
    toast.success("Solicitud de excepción enviada al administrador");
    setOverrideOpen(false);
    navigate("/calendar");
  }

  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-2xl font-bold">Nueva ventana de embarque</h1>

      <div className="space-y-1">
        <Label>Cliente</Label>
        <Select value={clientId} onValueChange={setClientId}>
          <SelectTrigger>
            <SelectValue placeholder="Selecciona un cliente" />
          </SelectTrigger>
          <SelectContent>
            {clients.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name} ({c.tier.name})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label>Nave</Label>
        <Select value={warehouseId} onValueChange={setWarehouseId}>
          <SelectTrigger>
            <SelectValue placeholder="Selecciona una nave" />
          </SelectTrigger>
          <SelectContent>
            {warehouses.map((w) => (
              <SelectItem key={w.id} value={w.id}>
                {w.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex gap-3">
        <div className="space-y-1 flex-1">
          <Label htmlFor="date">Fecha</Label>
          <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="space-y-1 flex-1">
          <Label htmlFor="time">Hora de llegada</Label>
          <Input id="time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
      </div>

      {end && (
        <p className="text-sm text-muted-foreground">
          Hora estimada de fin: {format(end, "HH:mm")}
        </p>
      )}

      <div className="space-y-1">
        <Label htmlFor="operatorName">Nombre del operador</Label>
        <Input id="operatorName" value={operatorName} onChange={(e) => setOperatorName(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="licensePlate">Placas</Label>
        <Input id="licensePlate" value={licensePlate} onChange={(e) => setLicensePlate(e.target.value)} />
      </div>

      {conflict && (
        <Alert variant="destructive">
          <AlertTitle>Conflicto de horario</AlertTitle>
          <AlertDescription>
            Ya existe la ventana de {conflict.client.name} ({format(new Date(conflict.scheduledStart), "HH:mm")}
            {" - "}
            {format(new Date(conflict.scheduledEnd), "HH:mm")}) en esta nave.
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => setOverrideOpen(true)}
            >
              Solicitar excepción al administrador
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <Button
        onClick={handleSubmit}
        disabled={!clientId || !warehouseId || !start || !operatorName || !licensePlate || !!conflict}
      >
        Guardar ventana
      </Button>

      <Dialog open={overrideOpen} onOpenChange={setOverrideOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Solicitar excepción</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Label htmlFor="overrideReason">Motivo</Label>
            <Textarea
              id="overrideReason"
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
            />
            <Button onClick={handleOverrideRequest} disabled={!overrideReason}>
              Enviar solicitud
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {createdWindow && (
        <WindowQrDialog open={qrOpen} onOpenChange={setQrOpen} window={createdWindow} />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Register routes in `app/routes.ts`**

Add `route("windows/new", "./routes/windows/new.tsx")` inside the existing `dashboard` layout's children array (it needs the authenticated header/nav, same as `_root.tsx`), and `route("api/overrides", "./routes/api/overrides.ts")` as a top-level route.

- [ ] **Step 4: Typecheck and commit**

Run: `npm run typecheck` — Expected: PASS.

```bash
git add app/routes/api/overrides.ts app/routes/windows/new.tsx app/routes.ts
git commit -m "feat: add new window page with conflict detection and override requests"
```

---

## Task 15: `/windows/:id` detail page

**Files:**
- Create: `app/routes/windows/detail.tsx`
- Modify: `app/routes.ts`

**Interfaces:**
- Consumes: `requireUser`, `prisma` (loader reads the window directly — no need for a `fetch` round trip since this is a real loader, unlike Task 14's client-only page), `POST /api/windows/:id/start`, `POST /api/windows/:id/complete` (Task 13), `WindowQrDialog` (Task 11).

- [ ] **Step 1: Create `app/routes/windows/detail.tsx`**

```tsx
// app/routes/windows/detail.tsx
import { useState } from "react";
import { useNavigate } from "react-router";
import type { Route } from "./+types/detail";
import { requireUser } from "~/lib/session.server";
import { prisma } from "~/lib/db.server";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Card, CardContent } from "~/components/ui/card";
import { WindowQrDialog } from "~/components/qr/WindowQrDialog";
import { toast } from "sonner";
import { format } from "date-fns";

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireUser(request);
  const window = await prisma.window.findUniqueOrThrow({
    where: { id: params.id },
    include: { client: { include: { tier: true } }, warehouse: true, overrideRequest: true },
  });
  return { window };
}

export default function WindowDetail({ loaderData }: Route.ComponentProps) {
  const { window } = loaderData;
  const navigate = useNavigate();
  const [qrOpen, setQrOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [rollsCount, setRollsCount] = useState("");
  const [delayReason, setDelayReason] = useState("");
  const [needsDelayReason, setNeedsDelayReason] = useState(false);

  async function handleStart() {
    const res = await fetch(`/api/windows/${window.id}/start`, { method: "POST" });
    if (!res.ok) {
      toast.error("No se pudo iniciar la ventana");
      return;
    }
    toast.success("Ventana iniciada");
    navigate(".", { replace: true });
  }

  async function handleComplete() {
    const res = await fetch(`/api/windows/${window.id}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rollsCount, delayReason: delayReason || undefined }),
    });
    if (res.status === 400) {
      setNeedsDelayReason(true);
      toast.error("Se superó el tiempo estimado: ingresa un motivo de retraso");
      return;
    }
    if (!res.ok) {
      toast.error("No se pudo completar la ventana");
      return;
    }
    toast.success("Ventana completada");
    setCompleteOpen(false);
    navigate(".", { replace: true });
  }

  return (
    <div className="max-w-xl space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">{window.client.name}</h1>
        <Badge>{window.status}</Badge>
      </div>

      <Card>
        <CardContent className="space-y-2 pt-6">
          <p>Nave: {window.warehouse.name}</p>
          <p>Tier: {window.client.tier.name}</p>
          <p>Operador: {window.operatorName}</p>
          <p>Placas: {window.licensePlate}</p>
          <p>
            Horario: {format(new Date(window.scheduledStart), "dd/MM/yyyy HH:mm")} -{" "}
            {format(new Date(window.scheduledEnd), "HH:mm")}
          </p>
          {window.rollsCount != null && <p>Rollos embarcados: {window.rollsCount}</p>}
          {window.delayReason && <p>Motivo de retraso: {window.delayReason}</p>}
        </CardContent>
      </Card>

      <div className="flex gap-2">
        {window.status === "SCHEDULED" && <Button onClick={handleStart}>Iniciar</Button>}
        {window.status === "IN_PROGRESS" && (
          <Button onClick={() => setCompleteOpen(true)}>Completar</Button>
        )}
        {window.qrCode && <Button variant="outline" onClick={() => setQrOpen(true)}>Ver QR</Button>}
      </div>

      <Dialog open={completeOpen} onOpenChange={setCompleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Completar ventana</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="rollsCount">Rollos embarcados</Label>
              <Input
                id="rollsCount"
                type="number"
                value={rollsCount}
                onChange={(e) => setRollsCount(e.target.value)}
              />
            </div>
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
          </div>
        </DialogContent>
      </Dialog>

      {window.qrCode && (
        <WindowQrDialog open={qrOpen} onOpenChange={setQrOpen} window={window} />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Register the route in `app/routes.ts`**

Add `route("windows/:id", "./routes/windows/detail.tsx")` inside the `dashboard` layout's children array.

- [ ] **Step 3: Typecheck and commit**

Run: `npm run typecheck` — Expected: PASS.

```bash
git add app/routes/windows/detail.tsx app/routes.ts
git commit -m "feat: add window detail page with start/complete actions"
```

---

## Task 16: Calendar page (`/calendar`)

**Files:**
- Create: `app/components/calendar/ShipmentCalendar.tsx`
- Create: `app/routes/calendar.tsx`
- Modify: `app/routes.ts`

**Interfaces:**
- Consumes: `@fullcalendar/react` (`FullCalendar`), `@fullcalendar/resource-timeline`, `@fullcalendar/interaction`, `GET /api/windows?date=`, `GET /api/warehouses`.
- Produces: `<ShipmentCalendar resources, events, onEventClick>` reusable wrapper. `/calendar` page wires it to live data and navigates to `/windows/:id` on event click; "+ Nueva Ventana" floating button shown only for `VENTAS`/`ADMINISTRADOR`.

- [ ] **Step 1: Create `app/components/calendar/ShipmentCalendar.tsx`**

```tsx
import FullCalendar from "@fullcalendar/react";
import resourceTimelinePlugin from "@fullcalendar/resource-timeline";
import interactionPlugin from "@fullcalendar/interaction";

const STATUS_COLORS: Record<string, string> = {
  SCHEDULED: "#64748b",
  IN_PROGRESS: "#2563eb",
  COMPLETED: "#16a34a",
  CANCELLED: "#dc2626",
};

export interface CalendarResource {
  id: string;
  title: string;
}

export interface CalendarEvent {
  id: string;
  resourceId: string;
  title: string;
  start: string;
  end: string;
  status: string;
}

export function ShipmentCalendar({
  resources,
  events,
  onEventClick,
}: {
  resources: CalendarResource[];
  events: CalendarEvent[];
  onEventClick: (id: string) => void;
}) {
  return (
    <FullCalendar
      plugins={[resourceTimelinePlugin, interactionPlugin]}
      initialView="resourceTimelineDay"
      resources={resources}
      events={events.map((e) => ({
        id: e.id,
        resourceId: e.resourceId,
        title: e.title,
        start: e.start,
        end: e.end,
        color: STATUS_COLORS[e.status] ?? STATUS_COLORS.SCHEDULED,
      }))}
      eventClick={(info) => onEventClick(info.event.id)}
      height="auto"
      slotMinTime="06:00:00"
      slotMaxTime="22:00:00"
    />
  );
}
```

- [ ] **Step 2: Create `app/routes/calendar.tsx`**

```tsx
// app/routes/calendar.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import type { Route } from "./+types/calendar";
import { requireUser } from "~/lib/session.server";
import { Button } from "~/components/ui/button";
import { ShipmentCalendar, type CalendarEvent, type CalendarResource } from "~/components/calendar/ShipmentCalendar";
import { format } from "date-fns";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  return { role: user.role };
}

export default function Calendar({ loaderData }: Route.ComponentProps) {
  const { role } = loaderData;
  const navigate = useNavigate();
  const [resources, setResources] = useState<CalendarResource[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [date] = useState(format(new Date(), "yyyy-MM-dd"));

  useEffect(() => {
    fetch("/api/warehouses")
      .then((r) => r.json())
      .then((warehouses) =>
        setResources(warehouses.map((w: any) => ({ id: w.id, title: w.name })))
      );
  }, []);

  useEffect(() => {
    fetch(`/api/windows?date=${date}`)
      .then((r) => r.json())
      .then((windows) =>
        setEvents(
          windows.map((w: any) => ({
            id: w.id,
            resourceId: w.warehouseId,
            title: `${w.client.name} (${w.operatorName})`,
            start: w.scheduledStart,
            end: w.scheduledEnd,
            status: w.status,
          }))
        )
      );
  }, [date]);

  return (
    <div className="space-y-4 relative">
      <h1 className="text-2xl font-bold">Calendario de ventanas</h1>
      <ShipmentCalendar
        resources={resources}
        events={events}
        onEventClick={(id) => navigate(`/windows/${id}`)}
      />
      {(role === "VENTAS" || role === "ADMINISTRADOR") && (
        <Button className="fixed bottom-6 right-6" onClick={() => navigate("/windows/new")}>
          + Nueva Ventana
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Register the route in `app/routes.ts`**

Add `route("calendar", "./routes/calendar.tsx")` inside the `dashboard` layout's children array.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, visit `/calendar`, confirm the 4 naves render as resource rows and any seeded/created windows show as colored blocks; click a window block, confirm it navigates to `/windows/:id`.

- [ ] **Step 5: Typecheck and commit**

Run: `npm run typecheck` — Expected: PASS.

```bash
git add app/components/calendar/ShipmentCalendar.tsx app/routes/calendar.tsx app/routes.ts
git commit -m "feat: add resourceTimeline calendar page"
```

---

## Task 17: Override review (API + admin page + nav badge)

**Files:**
- Create: `app/routes/api/overrides.$id.ts`
- Create: `app/routes/admin/overrides.tsx`
- Create: `app/components/admin/OverrideBadge.tsx`
- Modify: `app/routes/dashboard.tsx` (render the badge in the nav for admins)
- Modify: `app/routes.ts`

**Interfaces:**
- Consumes: `requireUser`, `prisma`, `logActivity`.
- Produces: `PATCH /api/overrides/:id` → body `{status: "APPROVED" | "REJECTED"}`; `APPROVED` leaves the window as `SCHEDULED`; `REJECTED` sets the window's `status` to `CANCELLED`. `<OverrideBadge count>` — a small pending-count pill linking to `/admin/overrides`; `dashboard.tsx`'s loader fetches the pending count via Prisma directly (not a fetch call, since it already runs server-side) and passes it down only when `user.role === "ADMINISTRADOR"`.

- [ ] **Step 1: Create `app/routes/api/overrides.$id.ts`**

```ts
// app/routes/api/overrides.$id.ts
import type { Route } from "./+types/overrides.$id";
import { requireUser } from "~/lib/session.server";
import { prisma } from "~/lib/db.server";
import { logActivity } from "~/lib/activity.server";

export async function action({ request, params }: Route.ActionArgs) {
  const user = await requireUser(request, ["ADMINISTRADOR"]);
  const body = await request.json();

  const overrideRequest = await prisma.overrideRequest.update({
    where: { id: params.id },
    data: { status: body.status, reviewedBy: user.id, reviewedAt: new Date() },
  });

  if (body.status === "REJECTED") {
    await prisma.window.update({
      where: { id: overrideRequest.windowId },
      data: { status: "CANCELLED" },
    });
  }

  await logActivity({
    userId: user.id,
    action: "REVIEW_OVERRIDE",
    entity: "OverrideRequest",
    entityId: overrideRequest.id,
    detail: body.status,
  });

  return Response.json(overrideRequest);
}
```

- [ ] **Step 2: Create `app/components/admin/OverrideBadge.tsx`**

```tsx
import { Link } from "react-router";
import { Badge } from "~/components/ui/badge";

export function OverrideBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <Link to="/admin/overrides">
      <Badge variant="destructive">{count} solicitud{count === 1 ? "" : "es"} pendiente{count === 1 ? "" : "s"}</Badge>
    </Link>
  );
}
```

- [ ] **Step 3: Create `app/routes/admin/overrides.tsx`**

```tsx
// app/routes/admin/overrides.tsx
import { useNavigate } from "react-router";
import type { Route } from "./+types/overrides";
import { requireUser } from "~/lib/session.server";
import { prisma } from "~/lib/db.server";
import { Button } from "~/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { toast } from "sonner";
import { format } from "date-fns";

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request, ["ADMINISTRADOR"]);
  const overrides = await prisma.overrideRequest.findMany({
    where: { status: "PENDING" },
    include: { window: { include: { client: true, warehouse: true } } },
    orderBy: { createdAt: "desc" },
  });
  return { overrides };
}

export default function OverridesAdmin({ loaderData }: Route.ComponentProps) {
  const { overrides } = loaderData;
  const navigate = useNavigate();

  async function review(id: string, status: "APPROVED" | "REJECTED") {
    const res = await fetch(`/api/overrides/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      toast.error("No se pudo procesar la solicitud");
      return;
    }
    toast.success(status === "APPROVED" ? "Solicitud aprobada" : "Solicitud rechazada");
    navigate(".", { replace: true });
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Solicitudes de excepción pendientes</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Cliente</TableHead>
            <TableHead>Nave</TableHead>
            <TableHead>Horario</TableHead>
            <TableHead>Motivo</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {overrides.map((o) => (
            <TableRow key={o.id}>
              <TableCell>{o.window.client.name}</TableCell>
              <TableCell>{o.window.warehouse.name}</TableCell>
              <TableCell>
                {format(new Date(o.window.scheduledStart), "dd/MM HH:mm")} -{" "}
                {format(new Date(o.window.scheduledEnd), "HH:mm")}
              </TableCell>
              <TableCell>{o.reason}</TableCell>
              <TableCell className="flex gap-2">
                <Button size="sm" onClick={() => review(o.id, "APPROVED")}>
                  Aprobar
                </Button>
                <Button size="sm" variant="destructive" onClick={() => review(o.id, "REJECTED")}>
                  Rechazar
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 4: Wire the badge into `dashboard.tsx`**

Read `app/lib/session.server.ts`'s currently-used `requireUserId` call inside `app/routes/dashboard.tsx`'s `loader` — replace it with `requireUser` so the full user (with `role`) is available, then add a pending-override count query gated on `ADMINISTRADOR`, and render `<OverrideBadge count={...} />` in the header next to the logout form:

```tsx
// inside app/routes/dashboard.tsx loader, after computing `user`:
const pendingOverrideCount =
  user.role === "ADMINISTRADOR"
    ? await prisma.overrideRequest.count({ where: { status: "PENDING" } })
    : 0;
return { user, pendingOverrideCount };
```

```tsx
// inside the component, in the header JSX, alongside the existing email/logout:
import { OverrideBadge } from "~/components/admin/OverrideBadge";
// ...
<OverrideBadge count={loaderData.pendingOverrideCount} />
```

- [ ] **Step 5: Register routes in `app/routes.ts`**

Add `route("admin/overrides", "./routes/admin/overrides.tsx")` inside the `admin` layout's children, and `route("api/overrides/:id", "./routes/api/overrides.$id.ts")` as a top-level route.

- [ ] **Step 6: Typecheck and commit**

Run: `npm run typecheck` — Expected: PASS.

```bash
git add app/routes/api/overrides.\$id.ts app/routes/admin/overrides.tsx app/components/admin/OverrideBadge.tsx app/routes/dashboard.tsx app/routes.ts
git commit -m "feat: add override approval workflow with pending badge"
```

---

## Task 18: Activity log admin page

**Files:**
- Create: `app/routes/admin/activity.tsx`
- Modify: `app/routes.ts`

**Interfaces:**
- Consumes: `requireUser`, `prisma`. Reads `ActivityLog` rows joined with `User` (manual lookup by `userId` since there's no Prisma relation between `ActivityLog` and `User` — keeping `ActivityLog` decoupled from the `User` table on purpose so log rows survive even if a user is later deleted).

- [ ] **Step 1: Create `app/routes/admin/activity.tsx`**

```tsx
// app/routes/admin/activity.tsx
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
import { format } from "date-fns";

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request, ["ADMINISTRADOR"]);
  const logs = await prisma.activityLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const userIds = [...new Set(logs.map((l) => l.userId))];
  const users = await prisma.user.findMany({ where: { id: { in: userIds } } });
  const userMap = new Map(users.map((u) => [u.id, u.name]));
  return {
    logs: logs.map((l) => ({ ...l, userName: userMap.get(l.userId) ?? `Usuario ${l.userId}` })),
  };
}

export default function ActivityAdmin({ loaderData }: Route.ComponentProps) {
  const { logs } = loaderData;
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Historial de actividad</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fecha</TableHead>
            <TableHead>Usuario</TableHead>
            <TableHead>Acción</TableHead>
            <TableHead>Entidad</TableHead>
            <TableHead>Detalle</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map((l) => (
            <TableRow key={l.id}>
              <TableCell>{format(new Date(l.createdAt), "dd/MM/yyyy HH:mm")}</TableCell>
              <TableCell>{l.userName}</TableCell>
              <TableCell>{l.action}</TableCell>
              <TableCell>{l.entity}</TableCell>
              <TableCell>{l.detail}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 2: Register the route in `app/routes.ts`**

Add `route("admin/activity", "./routes/admin/activity.tsx")` inside the `admin` layout's children.

- [ ] **Step 3: Typecheck and commit**

Run: `npm run typecheck` — Expected: PASS.

```bash
git add app/routes/admin/activity.tsx app/routes.ts
git commit -m "feat: add activity log admin page"
```

---

## Task 19: Role-aware dashboard (`_root.tsx`)

**Files:**
- Modify: `app/routes/_root.tsx`
- Modify: `app/routes.ts` (none expected — `_root.tsx` is already registered as the index route; this task only changes its content)

**Interfaces:**
- Consumes: `requireUser`, `prisma`. The existing `dashboard.tsx` layout loader already exposes `user` via its own loader; `_root.tsx` adds its own loader (index routes can have independent loaders alongside their parent layout's) to fetch role-specific metrics.

- [ ] **Step 1: Replace `app/routes/_root.tsx`**

```tsx
// app/routes/_root.tsx
import { Link } from "react-router";
import type { Route } from "./+types/_root";
import { requireUser } from "~/lib/session.server";
import { prisma } from "~/lib/db.server";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  if (user.role === "ADMINISTRADOR") {
    const [scheduled, inProgress, completed, delayed] = await Promise.all([
      prisma.window.count({ where: { scheduledStart: { gte: todayStart, lte: todayEnd }, status: "SCHEDULED" } }),
      prisma.window.count({ where: { scheduledStart: { gte: todayStart, lte: todayEnd }, status: "IN_PROGRESS" } }),
      prisma.window.count({ where: { scheduledStart: { gte: todayStart, lte: todayEnd }, status: "COMPLETED" } }),
      prisma.window.count({ where: { scheduledStart: { gte: todayStart, lte: todayEnd }, delayReason: { not: null } } }),
    ]);
    return { role: user.role, metrics: { scheduled, inProgress, completed, delayed } };
  }

  if (user.role === "CARGA" || user.role === "DESCARGA") {
    const windows = await prisma.window.findMany({
      where: {
        scheduledStart: { gte: todayStart, lte: todayEnd },
        type: user.role === "CARGA" ? "CARGA" : "DESCARGA",
      },
      include: { client: true, warehouse: true },
      orderBy: { scheduledStart: "asc" },
    });
    return { role: user.role, windows };
  }

  return { role: user.role };
}

export default function Index({ loaderData }: Route.ComponentProps) {
  if (loaderData.role === "ADMINISTRADOR") {
    const { metrics } = loaderData;
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Panel de administración</h1>
        <div className="grid grid-cols-4 gap-4">
          <Card>
            <CardHeader><CardTitle>Programadas</CardTitle></CardHeader>
            <CardContent className="text-3xl font-bold">{metrics.scheduled}</CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>En curso</CardTitle></CardHeader>
            <CardContent className="text-3xl font-bold">{metrics.inProgress}</CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Completadas</CardTitle></CardHeader>
            <CardContent className="text-3xl font-bold">{metrics.completed}</CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Con retraso</CardTitle></CardHeader>
            <CardContent className="text-3xl font-bold">{metrics.delayed}</CardContent>
          </Card>
        </div>
        <Button asChild><Link to="/calendar">Ver calendario</Link></Button>
      </div>
    );
  }

  if (loaderData.role === "CARGA" || loaderData.role === "DESCARGA") {
    const { windows } = loaderData;
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Ventanas de hoy</h1>
        <div className="space-y-2">
          {windows.length === 0 && <p className="text-muted-foreground">Sin ventanas programadas hoy.</p>}
          {windows.map((w) => (
            <Card key={w.id}>
              <CardContent className="flex justify-between items-center pt-6">
                <div>
                  <p className="font-medium">{w.client.name} — {w.warehouse.name}</p>
                  <p className="text-sm text-muted-foreground">{w.operatorName} · {w.licensePlate}</p>
                </div>
                <Button asChild variant="outline"><Link to={`/windows/${w.id}`}>Ver</Link></Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Bienvenido</h1>
      <p className="text-muted-foreground">Ya tienes sesión iniciada.</p>
      <div className="flex gap-2">
        <Button asChild><Link to="/windows/new">Nueva ventana</Link></Button>
        <Button asChild variant="outline"><Link to="/calendar">Ver calendario</Link></Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck and commit**

Run: `npm run typecheck` — Expected: PASS.

```bash
git add app/routes/_root.tsx
git commit -m "feat: add role-aware dashboard content"
```

---

## Task 20: Reports page + Excel export

**Files:**
- Create: `app/routes/api/reports.summary.ts`
- Create: `app/routes/api/reports.export.ts`
- Create: `app/routes/reports.tsx`
- Modify: `app/routes.ts`

**Interfaces:**
- Consumes: `requireUser`, `prisma`, `exceljs` (`ExcelJS.Workbook`).
- Produces: `GET /api/reports/summary?from&to&warehouseId?&clientId?&tierId?` → `{avgByClient: Array<{clientName, avgActualMinutes, avgEstimatedMinutes}>, delaysByClient: Array<{clientName, count}>, occupancyByWarehouse: Array<{warehouseName, count}>, rollsByPeriod: Array<{date, rolls}>, windows: Window[]}`. `GET /api/reports/export?<same filters>` → streams an `.xlsx` file with 3 sheets + embedded bar/line charts via `exceljs`'s native chart support is NOT available in `exceljs` (it has no chart API) — **deviation from spec**: `exceljs` can embed images but not native Excel charts; this task generates the 3 data sheets exactly as specified (Resumen, Detalle de ventanas, Retardos y motivos) and notes the chart requirement is satisfied by Sheet 1 containing pre-aggregated tables that Excel's own "Quick Analysis" can chart, rather than pre-rendered embedded chart objects. Flag this to the user after Task 20 lands — if native embedded charts are a hard requirement, a follow-up using a different library (e.g. generating chart images server-side and embedding as pictures) would be a separate task.

- [ ] **Step 1: Create `app/routes/api/reports.summary.ts`**

```ts
// app/routes/api/reports.summary.ts
import type { Route } from "./+types/reports.summary";
import { requireUser } from "~/lib/session.server";
import { prisma } from "~/lib/db.server";

function buildWhere(url: URL) {
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const warehouseId = url.searchParams.get("warehouseId");
  const clientId = url.searchParams.get("clientId");
  const tierId = url.searchParams.get("tierId");
  return {
    ...(from && to ? { scheduledStart: { gte: new Date(from), lte: new Date(to) } } : {}),
    ...(warehouseId ? { warehouseId } : {}),
    ...(clientId ? { clientId } : {}),
    ...(tierId ? { client: { tierId } } : {}),
  };
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request, ["ADMINISTRADOR"]);
  const url = new URL(request.url);
  const where = buildWhere(url);

  const windows = await prisma.window.findMany({
    where,
    include: { client: true, warehouse: true },
    orderBy: { scheduledStart: "asc" },
  });

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
    if (w.delayReason) entry.delays += 1;
    byClient.set(key, entry);

    byWarehouse.set(w.warehouse.name, (byWarehouse.get(w.warehouse.name) ?? 0) + 1);

    const dateKey = w.scheduledStart.toISOString().slice(0, 10);
    byDate.set(dateKey, (byDate.get(dateKey) ?? 0) + (w.rollsCount ?? 0));
  }

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
  });
}
```

- [ ] **Step 2: Create `app/routes/api/reports.export.ts`**

```ts
// app/routes/api/reports.export.ts
import ExcelJS from "exceljs";
import type { Route } from "./+types/reports.export";
import { requireUser } from "~/lib/session.server";
import { prisma } from "~/lib/db.server";

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
    if (w.delayReason) entry.delays += 1;
    byClient.set(w.client.name, entry);
  }
  for (const [name, v] of byClient) {
    summarySheet.addRow([name, v.actualCount ? Math.round(v.actualSum / v.actualCount) : "", v.estimated, v.delays]);
  }

  const detailSheet = workbook.addWorksheet("Detalle de ventanas");
  detailSheet.addRow([
    "ID", "Cliente", "Nave", "Tipo", "Inicio programado", "Fin programado",
    "Inicio real", "Fin real", "Operador", "Placas", "Rollos", "Estado", "Motivo de retraso",
  ]);
  for (const w of windows) {
    detailSheet.addRow([
      w.id, w.client.name, w.warehouse.name, w.type,
      w.scheduledStart.toISOString(), w.scheduledEnd.toISOString(),
      w.actualStart?.toISOString() ?? "", w.actualEnd?.toISOString() ?? "",
      w.operatorName, w.licensePlate, w.rollsCount ?? "", w.status, w.delayReason ?? "",
    ]);
  }

  const delaysSheet = workbook.addWorksheet("Retardos y motivos");
  delaysSheet.addRow(["Cliente", "Nave", "Fecha", "Motivo"]);
  for (const w of windows.filter((w) => w.delayReason)) {
    delaysSheet.addRow([w.client.name, w.warehouse.name, w.scheduledStart.toISOString(), w.delayReason]);
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

- [ ] **Step 3: Create `app/routes/reports.tsx`**

```tsx
// app/routes/reports.tsx
import { useEffect, useState } from "react";
import type { Route } from "./+types/reports";
import { requireUser } from "~/lib/session.server";
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
import { format, subDays } from "date-fns";

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request, ["ADMINISTRADOR"]);
  return {};
}

export default function Reports() {
  const [from, setFrom] = useState(format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [summary, setSummary] = useState<any>(null);

  useEffect(() => {
    fetch(`/api/reports/summary?from=${from}&to=${to}`)
      .then((r) => r.json())
      .then(setSummary);
  }, [from, to]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Reportes</h1>
      <div className="flex gap-3 items-end">
        <div className="space-y-1">
          <Label htmlFor="from">Desde</Label>
          <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="to">Hasta</Label>
          <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <Button asChild>
          <a href={`/api/reports/export?from=${from}&to=${to}`}>Exportar a Excel</a>
        </Button>
      </div>

      {summary && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Promedio real (min)</TableHead>
              <TableHead>Promedio estimado (min)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {summary.avgByClient.map((row: any) => (
              <TableRow key={row.clientName}>
                <TableCell>{row.clientName}</TableCell>
                <TableCell>{row.avgActualMinutes ?? "—"}</TableCell>
                <TableCell>{row.avgEstimatedMinutes}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Register routes in `app/routes.ts`**

Add `route("reports", "./routes/reports.tsx")` inside the `dashboard` layout's children, and `route("api/reports/summary", "./routes/api/reports.summary.ts")` + `route("api/reports/export", "./routes/api/reports.export.ts")` as top-level routes.

- [ ] **Step 5: Typecheck and commit**

Run: `npm run typecheck` — Expected: PASS.

```bash
git add app/routes/api/reports.summary.ts app/routes/api/reports.export.ts app/routes/reports.tsx app/routes.ts
git commit -m "feat: add reports page with Excel export"
```

---

## Task 21: Role-based navigation menu

**Files:**
- Modify: `app/routes/dashboard.tsx`

**Interfaces:**
- Consumes: `loaderData.user.role` (already returned by `dashboard.tsx`'s loader after Task 17's `requireUser` change).
- Produces: a nav bar visible on every authenticated page, with links gated by role: `/calendar` (all roles), `/windows/new` (`VENTAS`, `ADMINISTRADOR`), `/reports` and `/admin/*` (`ADMINISTRADOR` only).

- [ ] **Step 1: Read `app/routes/dashboard.tsx`** in full to see the exact current header markup (email + logout form) so the nav is inserted without breaking it.

- [ ] **Step 2: Add a nav bar to the header**

Insert into the header JSX, before or after the existing email/logout block:

```tsx
import { Link } from "react-router";

// ...inside the header, alongside the existing user email + logout form:
<nav className="flex gap-4 text-sm">
  <Link to="/">Inicio</Link>
  <Link to="/calendar">Calendario</Link>
  {(loaderData.user.role === "VENTAS" || loaderData.user.role === "ADMINISTRADOR") && (
    <Link to="/windows/new">Nueva ventana</Link>
  )}
  {loaderData.user.role === "ADMINISTRADOR" && (
    <>
      <Link to="/reports">Reportes</Link>
      <Link to="/admin/warehouses">Naves</Link>
      <Link to="/admin/clients">Clientes</Link>
      <Link to="/admin/tiers">Tiers</Link>
      <Link to="/admin/users">Usuarios</Link>
      <Link to="/admin/overrides">Excepciones</Link>
      <Link to="/admin/activity">Actividad</Link>
    </>
  )}
</nav>
```

- [ ] **Step 3: Manual verification**

Log in as a `VENTAS` user (toggle role via `/admin/users` or directly in the DB for testing), confirm `/admin/*` links are absent and that navigating to `/admin/warehouses` directly redirects to `/` (enforced by Task 7's `requireUser(request, ["ADMINISTRADOR"])` guard).

- [ ] **Step 4: Typecheck and commit**

Run: `npm run typecheck` — Expected: PASS.

```bash
git add app/routes/dashboard.tsx
git commit -m "feat: add role-based navigation menu"
```

---

## Task 22: Full smoke test

**Files:** none (verification only).

- [ ] **Step 1: Start the stack**

Run: `docker-compose up -d postgres` then `npm run dev`.

- [ ] **Step 2: Reset and reseed the database**

Run: `npx prisma migrate deploy && npm run seed`.

- [ ] **Step 3: Walk the VENTAS flow**

Log in, set your seeded user's role to `VENTAS` via direct DB update (`UPDATE "User" SET role = 'VENTAS' WHERE email = '<your-test-email>'`), go to `/windows/new`, create a window for "Acero del Norte" in "Nave 1" at a free time slot, confirm the QR dialog appears with a downloadable PNG, then confirm the window shows on `/calendar`.

- [ ] **Step 4: Walk the overlap/override flow**

Create a second window in the same warehouse with an overlapping time. Confirm the conflict alert appears with the existing window's client/time, click "Solicitar excepción", submit a reason, confirm a toast confirms submission and the window now exists with `status: SCHEDULED` and a `PENDING` `OverrideRequest`.

- [ ] **Step 5: Walk the admin override review flow**

Switch your user's role to `ADMINISTRADOR` in the DB, visit `/admin/overrides`, confirm the pending request appears with correct client/warehouse/reason, click "Rechazar", confirm the window's status becomes `CANCELLED` and the badge in the nav disappears.

- [ ] **Step 6: Walk the CARGA/DESCARGA flow**

Switch role to `CARGA`, open a `SCHEDULED` window's detail page, click "Iniciar", confirm status becomes `IN_PROGRESS`; click "Completar" with a rolls count, confirm it completes without requiring a delay reason if within the client's average time, and confirm a fresh window forced past the average time (manually edit `actualStart` in the DB to be old) requires the delay reason field before completing.

- [ ] **Step 7: Walk the reports flow**

Switch role back to `ADMINISTRADOR`, visit `/reports`, confirm the summary table populates, click "Exportar a Excel", confirm a `.xlsx` downloads with 3 sheets (Resumen, Detalle de ventanas, Retardos y motivos) containing the expected rows.

- [ ] **Step 8: Final full-repo typecheck and test run**

Run: `npm run typecheck && npm test`
Expected: both PASS with no errors.

- [ ] **Step 9: Commit any fixes found during smoke testing**

If Steps 3–7 surfaced bugs, fix them now and commit each fix separately with a `fix:` message before considering the feature done.

---

## Self-Review Notes

- **Spec coverage:** All 4 roles, all listed pages/routes, overlap validation (same-warehouse only, cross-warehouse allowed), tier-based priority display, QR generation + PNG download, override request/approval flow, delay-reason-required completion logic, admin CRUD for users/clients/warehouses/tiers, activity log, Excel export with 3 sheets are each covered by a task above. Two intentional deviations from the literal spec text are called out inline: (1) `User`/foreign-key ID types stay `Int` to match the existing template instead of spec's `String`/cuid (Global Constraints + Task 1); (2) `exceljs` has no native chart-embedding API, so "gráficas embebidas" is satisfied via pre-aggregated data sheets rather than literal embedded chart objects (Task 20) — flag this to the user before/after Task 20 lands in case they want a different library swapped in.
- **Resource-route note:** React Router v7 resource routes (loader/action, no default export) are used for every `api/*` path above — confirm during Task 1/2 setup that the installed `@react-router/dev` version (7.15.1, already in `package.json`) supports this pattern as used (it does, as of v7 framework mode).