# Calendario responsivo + glassmorphism ligero Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the calendar's fixed 720px height so it never forces page scroll, add subtle glassmorphism to the shared surface primitives, and lighten the dark-blue theme's background/card/sidebar tokens by a small, deliberate amount.

**Architecture:** Task 1 changes `ShipmentCalendar.tsx` to a viewport-relative `clamp()` height wrapper with FullCalendar's `height="100%"` mode. Task 2 touches five shared `app/components/ui/*` primitives (`card.tsx`, `dialog.tsx`, `popover.tsx`, `dropdown-menu.tsx`, `sidebar.tsx`) so every consumer of them (which is nearly every page) inherits the glass effect with no per-page changes. Task 3 edits three CSS custom properties in `app/app.css`. Task 4 verifies.

**Tech Stack:** Tailwind v4 (arbitrary values, `backdrop-blur-*`, opacity modifiers), `@fullcalendar/react`, shadcn/ui primitives.

## Global Constraints

- Calendar height: `h-[clamp(520px,calc(100vh-260px),880px)]` wrapper + `height="100%"` on `<FullCalendar>` — not a flat number.
- Glassmorphism goes on shared primitives only (`Card`, `DialogContent`, `PopoverContent`, `DropdownMenuContent`/`DropdownMenuSubContent`, the `Sidebar` inner containers) — never on `WindowQrDialog`, which must stay solid white for QR scannability.
- Theme lightening touches exactly three tokens in `.dark` — `--background`, `--card`/`--popover`, `--sidebar` — each by `+0.03` oklch lightness. `--primary`, `--muted`, `--border`, `--accent`, and every other token stay untouched.
- `npm run typecheck` must pass after every task that touches `.tsx` files.

---

### Task 1: Viewport-relative calendar height

**Files:**
- Modify: `app/components/calendar/ShipmentCalendar.tsx`

**Interfaces:**
- Consumes: none new.
- Produces: no prop/type changes to `ShipmentCalendar` — purely internal JSX/CSS.

- [ ] **Step 1: Wrap FullCalendar in a height-clamped container**

Replace the full contents of `app/components/calendar/ShipmentCalendar.tsx` with:

```tsx
import FullCalendar from "@fullcalendar/react";
import resourceTimelinePlugin from "@fullcalendar/resource-timeline";
import interactionPlugin from "@fullcalendar/interaction";

const STATUS_COLORS: Record<string, string> = {
  SCHEDULED: "#64748b",
  ARRIVED: "#d97706",
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
    <div className="h-[clamp(520px,calc(100vh-260px),880px)]">
      <FullCalendar
        schedulerLicenseKey="CC-Attribution-NonCommercial-NoDerivatives"
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
        height="100%"
        expandRows={true}
        slotMinTime="06:00:00"
        slotMaxTime="22:00:00"
      />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/components/calendar/ShipmentCalendar.tsx
git commit -m "fix: make calendar height viewport-relative instead of a flat 720px"
```

---

### Task 2: Glassmorphism on shared surface primitives

**Files:**
- Modify: `app/components/ui/card.tsx`
- Modify: `app/components/ui/dialog.tsx`
- Modify: `app/components/ui/popover.tsx`
- Modify: `app/components/ui/dropdown-menu.tsx`
- Modify: `app/components/ui/sidebar.tsx`

**Interfaces:**
- Consumes: none new.
- Produces: no prop/type changes to any of these five components — only their default class strings change, so every existing usage across the app picks up the new look automatically.

- [ ] **Step 1: `Card`**

In `app/components/ui/card.tsx`, change:

```tsx
        "group/card flex flex-col gap-(--card-spacing) overflow-hidden rounded-xl bg-card py-(--card-spacing) text-sm text-card-foreground ring-1 ring-foreground/10 [--card-spacing:--spacing(4)] has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:[--card-spacing:--spacing(3)] data-[size=sm]:has-data-[slot=card-footer]:pb-0 *:[img:first-child]:rounded-t-xl *:[img:last-child]:rounded-b-xl",
```

to:

```tsx
        "group/card flex flex-col gap-(--card-spacing) overflow-hidden rounded-xl bg-card/70 py-(--card-spacing) text-sm text-card-foreground ring-1 ring-foreground/10 backdrop-blur-md [--card-spacing:--spacing(4)] has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:[--card-spacing:--spacing(3)] data-[size=sm]:has-data-[slot=card-footer]:pb-0 *:[img:first-child]:rounded-t-xl *:[img:last-child]:rounded-b-xl",
```

- [ ] **Step 2: `DialogContent`**

In `app/components/ui/dialog.tsx`, change:

```tsx
          "fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-popover p-4 text-sm text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
```

to:

```tsx
          "fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-popover/80 p-4 text-sm text-popover-foreground ring-1 ring-foreground/10 backdrop-blur-md duration-100 outline-none sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
```

- [ ] **Step 3: `PopoverContent`**

In `app/components/ui/popover.tsx`, change:

```tsx
          "z-50 flex w-72 origin-(--radix-popover-content-transform-origin) flex-col gap-2.5 rounded-lg bg-popover p-2.5 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-hidden duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
```

to:

```tsx
          "z-50 flex w-72 origin-(--radix-popover-content-transform-origin) flex-col gap-2.5 rounded-lg bg-popover/80 p-2.5 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10 backdrop-blur-md outline-hidden duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
```

- [ ] **Step 4: `DropdownMenuContent` and `DropdownMenuSubContent`**

In `app/components/ui/dropdown-menu.tsx`, change:

```tsx
        className={cn("z-50 max-h-(--radix-dropdown-menu-content-available-height) w-(--radix-dropdown-menu-trigger-width) min-w-32 origin-(--radix-dropdown-menu-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:overflow-hidden data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95", className )}
```

to:

```tsx
        className={cn("z-50 max-h-(--radix-dropdown-menu-content-available-height) w-(--radix-dropdown-menu-trigger-width) min-w-32 origin-(--radix-dropdown-menu-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-lg bg-popover/80 p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 backdrop-blur-md duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:overflow-hidden data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95", className )}
```

Then change:

```tsx
      className={cn("z-50 min-w-[96px] origin-(--radix-dropdown-menu-content-transform-origin) overflow-hidden rounded-lg bg-popover p-1 text-popover-foreground shadow-lg ring-1 ring-foreground/10 duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95", className )}
```

to:

```tsx
      className={cn("z-50 min-w-[96px] origin-(--radix-dropdown-menu-content-transform-origin) overflow-hidden rounded-lg bg-popover/80 p-1 text-popover-foreground shadow-lg ring-1 ring-foreground/10 backdrop-blur-md duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95", className )}
```

- [ ] **Step 5: `Sidebar` (desktop inner container and mobile sheet)**

In `app/components/ui/sidebar.tsx`, change:

```tsx
        <div
          data-sidebar="sidebar"
          data-slot="sidebar-inner"
          className="flex size-full flex-col bg-sidebar group-data-[variant=floating]:rounded-lg group-data-[variant=floating]:shadow-sm group-data-[variant=floating]:ring-1 group-data-[variant=floating]:ring-sidebar-border"
        >
```

to:

```tsx
        <div
          data-sidebar="sidebar"
          data-slot="sidebar-inner"
          className="flex size-full flex-col bg-sidebar/80 backdrop-blur-md group-data-[variant=floating]:rounded-lg group-data-[variant=floating]:shadow-sm group-data-[variant=floating]:ring-1 group-data-[variant=floating]:ring-sidebar-border"
        >
```

Then change:

```tsx
          className="w-(--sidebar-width) bg-sidebar p-0 text-sidebar-foreground [&>button]:hidden"
```

to:

```tsx
          className="w-(--sidebar-width) bg-sidebar/80 backdrop-blur-md p-0 text-sidebar-foreground [&>button]:hidden"
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add app/components/ui/card.tsx app/components/ui/dialog.tsx app/components/ui/popover.tsx app/components/ui/dropdown-menu.tsx app/components/ui/sidebar.tsx
git commit -m "feat: add subtle glassmorphism to card/dialog/popover/dropdown/sidebar surfaces"
```

---

### Task 3: Slightly lighten the dark-blue theme

**Files:**
- Modify: `app/app.css`

**Interfaces:**
- Consumes: none new.
- Produces: no new tokens — three existing `.dark` custom properties get a small lightness bump.

- [ ] **Step 1: Bump `--background`, `--card`/`--popover`, and `--sidebar`**

In `app/app.css`, inside the `.dark { ... }` block, change:

```css
  --background: oklch(0.16 0.025 255);
  --foreground: oklch(0.95 0.01 255);
  --card: oklch(0.205 0.03 255);
  --card-foreground: oklch(0.95 0.01 255);
  --popover: oklch(0.205 0.03 255);
```

to:

```css
  --background: oklch(0.19 0.025 255);
  --foreground: oklch(0.95 0.01 255);
  --card: oklch(0.235 0.03 255);
  --card-foreground: oklch(0.95 0.01 255);
  --popover: oklch(0.235 0.03 255);
```

Then change:

```css
  --sidebar: oklch(0.13 0.02 255);
```

to:

```css
  --sidebar: oklch(0.16 0.02 255);
```

Every other token in `.dark` (`--primary`, `--secondary`, `--muted`, `--accent`, `--destructive`,
`--border`, `--input`, `--ring`, `--chart-*`, `--sidebar-foreground`, `--sidebar-primary`,
`--sidebar-accent`, `--sidebar-border`, `--sidebar-ring`, `--radius`) stays exactly as-is.

- [ ] **Step 2: Commit**

```bash
git add app/app.css
git commit -m "style: lighten background/card/sidebar tokens slightly"
```

(No typecheck needed — this task only touches CSS custom properties, no `.ts`/`.tsx` files.)

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

- [ ] **Step 3: Confirm the calendar route still responds**

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
Expected: prints a `_session=...` value.

Run: `curl -s -b "<value from above>" -o /dev/null -w "%{http_code}\n" "http://localhost:5177/calendar"`
Expected: `200`.

Delete the throwaway script: `rm -f _verify-mint-cookie.ts`

- [ ] **Step 4: Manual visual walk (requires a browser — do this yourself, no browser automation available)**

- `/calendar` on a normal laptop-sized browser window — confirm the page does not need to
  scroll to see the whole calendar, and the grid still looks appropriately tall (not
  compressed like the original `height="auto"`, not overflowing like the flat `720px`).
- Resize the browser shorter and taller — confirm the calendar shrinks/grows within the
  `520px`–`880px` clamp range instead of jumping or overflowing.
- Open any `Card` (dashboard stat tile, admin table), a `Dialog` (e.g. "Nuevo cliente" on
  `/admin/clients`), the `UserMenu` dropdown, and a `Select` popover — confirm each shows a
  visible blur/translucency effect without becoming hard to read (text contrast still fine).
- Compare the sidebar and page background shade before/after — confirm the lightening is
  subtle, not a jarring change.

- [ ] **Step 5: Stop the dev server**

Run: `netstat -ano | grep :5177` (Windows) to find the PID, then `taskkill //PID <pid> //T //F`.
