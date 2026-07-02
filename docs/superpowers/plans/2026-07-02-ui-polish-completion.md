# Cierre del rediseño SaaS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Commit the already-finished uncommitted SaaS shell/admin work, remove the now-redundant `/windows/new` page in favor of the calendar's existing dialog, and fix the calendar's compressed height.

**Architecture:** Task 1 is a pure commit of pre-existing, verified-complete work (no code changes). Task 2 deletes one route and its four references (route registration, sidebar nav item, breadcrumb label, dashboard quick-action card). Task 3 is a two-line prop change on the FullCalendar wrapper. Task 4 verifies nothing broke.

**Tech Stack:** React Router v7, ShadCN sidebar/card components, `@fullcalendar/react`.

## Global Constraints

- Do not modify any file already confirmed complete in Task 1 — commit it as-is.
- `/windows/new` is deleted outright, not redirected — the calendar's dialog already covers the full flow including conflict/override handling.
- Calendar height: fixed `720px` with `expandRows={true}` (not a viewport-relative height).
- No business logic, validation, schema, or API behavior changes beyond what Task 1 already contains (the pre-existing `PATCH` support in `api/clients.ts`/`tiers.ts`/`warehouses.ts`).
- `npm run typecheck` must pass after every task that touches `.tsx`/`.ts` files.

---

### Task 1: Commit the finished uncommitted shell/admin work

**Files:**
- Commit as-is (no edits): `app/app.css`, `app/routes/admin/activity.tsx`, `app/routes/admin/clients.tsx`, `app/routes/admin/layout.tsx`, `app/routes/admin/overrides.tsx`, `app/routes/admin/tiers.tsx`, `app/routes/admin/users.tsx`, `app/routes/admin/warehouses.tsx`, `app/routes/api/clients.ts`, `app/routes/api/tiers.ts`, `app/routes/api/warehouses.ts`, `app/routes/dashboard.tsx`, `app/components/layout/` (new directory), `app/hooks/` (new directory), `app/lib/navigation.ts` (new file).

**Interfaces:**
- Produces: no new interfaces beyond what already exists in these files today — this task only moves already-written code into git history.

- [ ] **Step 1: Confirm the working tree matches what was reviewed during design**

Run: `git status --short`
Expected: exactly this set of modified/untracked entries (order may differ):
```
 M app/app.css
 M app/routes/admin/activity.tsx
 M app/routes/admin/clients.tsx
 M app/routes/admin/layout.tsx
 M app/routes/admin/overrides.tsx
 M app/routes/admin/tiers.tsx
 M app/routes/admin/users.tsx
 M app/routes/admin/warehouses.tsx
 M app/routes/api/clients.ts
 M app/routes/api/tiers.ts
 M app/routes/api/warehouses.ts
 M app/routes/dashboard.tsx
 M app/routes/windows/new.tsx
?? app/components/layout/
?? app/hooks/
?? app/lib/navigation.ts
```
(Plus unrelated untracked entries like `.claude/`, `.wolf/`, `CLAUDE.md`, `PROMPT_CLAUDE_CODE.md`, and stray doc files — ignore those, they are not part of this plan.)

If `app/routes/windows/new.tsx` is NOT in this list (e.g., already committed by a prior session), skip ahead to Task 2 without concern — Task 2 Step 1 handles deleting it either way.

- [ ] **Step 2: Typecheck before committing**

Run: `npm run typecheck`
Expected: no errors. (This confirms the already-written code is genuinely finished, not a half-edited state.)

- [ ] **Step 3: Commit**

```bash
git add app/app.css app/routes/admin app/routes/api/clients.ts app/routes/api/tiers.ts app/routes/api/warehouses.ts app/routes/dashboard.tsx app/components/layout app/hooks app/lib/navigation.ts
git commit -m "feat: finish SaaS shell — sidebar nav, page headers, admin table polish, inline edit"
```

---

### Task 2: Remove `/windows/new`

**Files:**
- Delete: `app/routes/windows/new.tsx`
- Modify: `app/routes.ts`
- Modify: `app/components/layout/AppSidebar.tsx`
- Modify: `app/lib/navigation.ts`
- Modify: `app/routes/_root.tsx`

**Interfaces:**
- Consumes: none new.
- Produces: `/windows/new` no longer exists as a route; every reference to it in the app is removed.

- [ ] **Step 1: Delete the route file**

Run: `rm app/routes/windows/new.tsx`

- [ ] **Step 2: Remove the route registration**

In `app/routes.ts`, change:

```ts
    route("windows/new", "./routes/windows/new.tsx"),
    route("windows/:id", "./routes/windows/detail.tsx"),
```

to:

```ts
    route("windows/:id", "./routes/windows/detail.tsx"),
```

- [ ] **Step 3: Remove the sidebar nav item**

In `app/components/layout/AppSidebar.tsx`, change:

```tsx
import { Link, useLocation } from "react-router";
import {
  CalendarRange,
  ClipboardList,
  History,
  Home,
  LayoutGrid,
  PlusCircle,
  ShieldCheck,
  Users,
  Warehouse,
} from "lucide-react";
```

to:

```tsx
import { Link, useLocation } from "react-router";
import {
  CalendarRange,
  ClipboardList,
  History,
  Home,
  LayoutGrid,
  ShieldCheck,
  Users,
  Warehouse,
} from "lucide-react";
```

Then change:

```tsx
export function AppSidebar({ role }: { role: Role }) {
  const { pathname } = useLocation();
  const canCreateWindow = role === "VENTAS" || role === "ADMINISTRADOR";

  return (
```

to:

```tsx
export function AppSidebar({ role }: { role: Role }) {
  const { pathname } = useLocation();

  return (
```

Then change:

```tsx
            <SidebarMenu>
              {operationItems.map((item) => (
                <NavLinkItem key={item.to} item={item} pathname={pathname} />
              ))}
              {canCreateWindow && (
                <NavLinkItem
                  item={{ to: "/windows/new", label: "Nueva ventana", icon: PlusCircle }}
                  pathname={pathname}
                />
              )}
            </SidebarMenu>
```

to:

```tsx
            <SidebarMenu>
              {operationItems.map((item) => (
                <NavLinkItem key={item.to} item={item} pathname={pathname} />
              ))}
            </SidebarMenu>
```

- [ ] **Step 4: Remove the breadcrumb label**

In `app/lib/navigation.ts`, change:

```ts
const STATIC_LABELS: [prefix: string, label: string][] = [
  ["/windows/new", "Nueva ventana"],
  ["/calendar", "Calendario"],
```

to:

```ts
const STATIC_LABELS: [prefix: string, label: string][] = [
  ["/calendar", "Calendario"],
```

- [ ] **Step 5: Remove the dashboard quick-action card**

In `app/routes/_root.tsx`, change:

```tsx
import {
  CalendarRange,
  Clock3,
  ListChecks,
  PlusCircle,
  TimerReset,
} from "lucide-react";
```

to:

```tsx
import {
  CalendarRange,
  Clock3,
  ListChecks,
  TimerReset,
} from "lucide-react";
```

Then change:

```tsx
  return (
    <div className="space-y-6">
      <PageHeader title="Bienvenido" description={today} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
        <Link to="/windows/new">
          <Card className="hover:bg-accent transition-colors">
            <CardContent className="flex items-center gap-3 pt-6">
              <PlusCircle className="size-5 text-primary" />
              <span className="font-medium">Nueva ventana</span>
            </CardContent>
          </Card>
        </Link>
        <Link to="/calendar">
          <Card className="hover:bg-accent transition-colors">
            <CardContent className="flex items-center gap-3 pt-6">
              <CalendarRange className="size-5 text-primary" />
              <span className="font-medium">Ver calendario</span>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
```

to:

```tsx
  return (
    <div className="space-y-6">
      <PageHeader title="Bienvenido" description={today} />
      <div className="max-w-xs">
        <Link to="/calendar">
          <Card className="hover:bg-accent transition-colors">
            <CardContent className="flex items-center gap-3 pt-6">
              <CalendarRange className="size-5 text-primary" />
              <span className="font-medium">Ver calendario</span>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Confirm no reference to `/windows/new` remains**

Run: `grep -rn "windows/new" app/`
Expected: no output (empty).

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: no errors. (This regenerates the route manifest without `/windows/new` and confirms nothing still imports the deleted file or its generated types.)

- [ ] **Step 8: Commit**

```bash
git add app/routes.ts app/components/layout/AppSidebar.tsx app/lib/navigation.ts app/routes/_root.tsx app/routes/windows/new.tsx
git commit -m "refactor: remove /windows/new, calendar dialog is now the only way to create a window"
```

(`git add` on the deleted `new.tsx` path stages its removal.)

---

### Task 3: Increase calendar height

**Files:**
- Modify: `app/components/calendar/ShipmentCalendar.tsx`

**Interfaces:**
- Consumes: none new.
- Produces: no prop/type changes — purely a visual height fix.

- [ ] **Step 1: Change the height prop and enable expandRows**

In `app/components/calendar/ShipmentCalendar.tsx`, change:

```tsx
      eventClick={(info) => onEventClick(info.event.id)}
      height="auto"
      slotMinTime="06:00:00"
      slotMaxTime="22:00:00"
    />
```

to:

```tsx
      eventClick={(info) => onEventClick(info.event.id)}
      height={720}
      expandRows={true}
      slotMinTime="06:00:00"
      slotMaxTime="22:00:00"
    />
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/components/calendar/ShipmentCalendar.tsx
git commit -m "fix: give the calendar a taller, fixed height instead of auto"
```

---

### Task 4: Verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full automated suite**

Run: `npx vitest run && npm run typecheck`
Expected: all existing test files pass unchanged, zero typecheck errors.

- [ ] **Step 2: Start a local server against the reachable database**

Run: `docker compose up -d postgres` (if not already running), then:

Run: `DATABASE_URL="postgresql://postgres:1234@localhost:5432/app_template" npx react-router dev --port 5177`
Expected: server logs `Local: http://localhost:5177/`.

- [ ] **Step 3: Confirm `/windows/new` is gone**

Run: `curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:5177/windows/new"`
Expected: `404` (no matching route — confirms the deletion took effect and there's no stale route
manifest entry).

- [ ] **Step 4: Manual visual walk (requires a browser — do this yourself, no browser automation available)**

Log in and check:
- `/calendar` — the "+ Nueva ventana" button still opens the dialog and creates a window
  end-to-end (including triggering a conflict and requesting an override, to confirm nothing
  regressed when `/windows/new` was deleted). The calendar grid is visibly taller than before.
- The sidebar no longer shows a "Nueva ventana" item for VENTAS/ADMINISTRADOR.
- `/` as VENTAS shows a single "Ver calendario" card, not two.
- `/admin/clients`, `/admin/tiers`, `/admin/warehouses`, `/admin/users`, `/admin/overrides`,
  `/admin/activity` — badges, empty states, and (for clients/tiers/warehouses) the "Editar"
  dialogs all work.
- Sidebar collapsed-to-icons and mobile-overlay states still render correctly.

- [ ] **Step 5: Stop the dev server**

Run: `netstat -ano | grep :5177` (Windows) to find the PID, then `taskkill //PID <pid> //T //F`.
