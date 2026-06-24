# Dark Blue Frontend Remake Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current light "Outlook" theme with a single, always-on dark-blue SaaS theme (Linear/Vercel style) across the entire frontend, with zero changes to loaders/actions/business logic.

**Architecture:** All color comes from the CSS custom properties in `app/app.css`. Investigation of the current codebase (built under the prior `2026-06-24-saas-ui-refactor-design.md` spec) confirmed every route/component already consumes those tokens semantically (`bg-primary`, `text-muted-foreground`, etc.) — there is no per-page hardcoded light-theme styling to hunt down, with exactly two exceptions: `app/routes/auth/login.tsx` (hand-rolled `<button>` with `hover:bg-gray-50`) and the legacy Outlook-template CSS blocks in `app.css` itself (`header-area`, `composer-body`, `sent-delivered-badge` — confirmed unused by any other file). The remake therefore concentrates on: (1) retokenizing `app.css` to one dark-blue palette and dropping the light/dark split, (2) reinstalling every shadcn primitive from a clean slate per the user's explicit "delete and recreate" instruction, (3) adding FullCalendar dark-mode CSS variable overrides (the one library that doesn't consume shadcn tokens), and (4) rebuilding the login page. Every other route file is touched only to confirm zero hardcoded colors remain — no JSX restructuring, since the structure built under the prior spec is sound and the goal is a new look, not a new layout.

**Tech Stack:** React Router v7, Tailwind v4 (`@theme`/CSS vars), shadcn/ui (`radix-nova` style, `neutral` base per `components.json`), `@fullcalendar/react` + `resource-timeline`, `lucide-react`.

## Global Constraints

- Single dark theme only — no light mode, no theme toggle, no `next-themes` (confirmed not currently used anywhere in `app/`).
- Zero changes to any `loader`/`action`/Prisma/validation code in any route or `lib` file.
- No new business features, no pagination/search additions, no fabricated metrics.
- UI copy stays in Spanish (es-MX).
- shadcn primitives must come from a fresh `npx shadcn add` run (clean slate), not hand-patched.
- `npm run typecheck` must pass after every task that touches `.tsx`/`.ts` files.

---

## Task 1: Retokenize `app.css` to a single dark-blue theme

**Files:**
- Modify: `app/app.css` (full rewrite)

**Interfaces:**
- Produces: the only color source for every later task. All `--background`/`--primary`/`--card`/etc. tokens consumed by every shadcn primitive (Task 2) and every route. Also produces the `.fc` (FullCalendar) CSS variable block consumed by Task 5.

- [ ] **Step 1: Replace the full contents of `app/app.css`**

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";
@import "@fontsource-variable/inter";

@custom-variant dark (&:is(.dark *));

@theme {
  --font-sans: "Inter Variable", "Segoe UI", ui-sans-serif, system-ui, sans-serif,
    "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji";
}

html,
body {
  color-scheme: dark;
}

@theme inline {
  --font-heading: var(--font-sans);
  --font-sans: 'Inter Variable', sans-serif;
  --color-sidebar-ring: var(--sidebar-ring);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar: var(--sidebar);
  --color-chart-5: var(--chart-5);
  --color-chart-4: var(--chart-4);
  --color-chart-3: var(--chart-3);
  --color-chart-2: var(--chart-2);
  --color-chart-1: var(--chart-1);
  --color-ring: var(--ring);
  --color-input: var(--input);
  --color-border: var(--border);
  --color-destructive: var(--destructive);
  --color-accent-foreground: var(--accent-foreground);
  --color-accent: var(--accent);
  --color-muted-foreground: var(--muted-foreground);
  --color-muted: var(--muted);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-secondary: var(--secondary);
  --color-primary-foreground: var(--primary-foreground);
  --color-primary: var(--primary);
  --color-popover-foreground: var(--popover-foreground);
  --color-popover: var(--popover);
  --color-card-foreground: var(--card-foreground);
  --color-card: var(--card);
  --color-foreground: var(--foreground);
  --color-background: var(--background);
  --radius-sm: calc(var(--radius) * 0.6);
  --radius-md: calc(var(--radius) * 0.8);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) * 1.4);
  --radius-2xl: calc(var(--radius) * 1.8);
  --radius-3xl: calc(var(--radius) * 2.2);
  --radius-4xl: calc(var(--radius) * 2.6);
}

/*
 * Single dark-blue theme. The `.dark` selector is kept (rather than renamed
 * to `:root`) because shadcn-generated components emit `dark:` utility
 * classes for things outside the CSS-variable system (e.g. focus ring
 * opacity). `<html class="dark">` is set permanently in app/root.tsx so
 * those utilities stay active with no toggle and no light fallback.
 */
.dark {
  --background: oklch(0.16 0.025 255);
  --foreground: oklch(0.95 0.01 255);
  --card: oklch(0.205 0.03 255);
  --card-foreground: oklch(0.95 0.01 255);
  --popover: oklch(0.205 0.03 255);
  --popover-foreground: oklch(0.95 0.01 255);
  --primary: oklch(0.62 0.19 255);
  --primary-foreground: oklch(0.98 0 0);
  --secondary: oklch(0.26 0.03 255);
  --secondary-foreground: oklch(0.95 0.01 255);
  --muted: oklch(0.22 0.025 255);
  --muted-foreground: oklch(0.65 0.02 255);
  --accent: oklch(0.28 0.05 255);
  --accent-foreground: oklch(0.95 0.01 255);
  --destructive: oklch(0.62 0.21 25);
  --border: oklch(1 0 0 / 8%);
  --input: oklch(1 0 0 / 12%);
  --ring: oklch(0.62 0.19 255);
  --chart-1: oklch(0.62 0.19 255);
  --chart-2: oklch(0.70 0.15 220);
  --chart-3: oklch(0.55 0.16 270);
  --chart-4: oklch(0.75 0.10 230);
  --chart-5: oklch(0.45 0.14 255);
  --radius: 0.625rem;
  --sidebar: oklch(0.13 0.02 255);
  --sidebar-foreground: oklch(0.95 0.01 255);
  --sidebar-primary: oklch(0.62 0.19 255);
  --sidebar-primary-foreground: oklch(0.98 0 0);
  --sidebar-accent: oklch(0.24 0.04 255);
  --sidebar-accent-foreground: oklch(0.95 0.01 255);
  --sidebar-border: oklch(1 0 0 / 8%);
  --sidebar-ring: oklch(0.62 0.19 255);
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground;
  }
  html {
    @apply font-sans dark;
  }
}

/* Sidebar active nav item — primary-tinted background, no left stripe */
[data-sidebar="menu-button"][data-active="true"] {
  background-color: color-mix(in oklch, var(--primary) 16%, transparent);
  color: var(--primary);
  font-weight: 600;
}
[data-sidebar="menu-button"][data-active="true"] svg {
  color: var(--primary);
}

/* FullCalendar (resourceTimeline) — doesn't consume shadcn tokens directly,
   so its own CSS variables are pointed at ours for the calendar route. */
.fc {
  --fc-border-color: var(--border);
  --fc-page-bg-color: var(--card);
  --fc-neutral-bg-color: var(--muted);
  --fc-list-event-hover-bg-color: var(--accent);
  --fc-today-bg-color: color-mix(in oklch, var(--primary) 12%, transparent);
  --fc-button-bg-color: var(--secondary);
  --fc-button-border-color: var(--border);
  --fc-button-hover-bg-color: var(--accent);
  --fc-button-hover-border-color: var(--border);
  --fc-button-active-bg-color: var(--primary);
  --fc-button-text-color: var(--foreground);
  color: var(--foreground);
}
.fc .fc-timeline-slot-cushion,
.fc .fc-resource-timeline-divider,
.fc .fc-col-header-cell-cushion,
.fc .fc-datagrid-cell-cushion {
  color: var(--foreground);
}
.fc .fc-scrollgrid,
.fc table {
  border-color: var(--border);
}
.fc .fc-datagrid-cell-frame,
.fc .fc-timeline-slot-frame {
  border-color: var(--border);
}
```

This removes: the light `:root` token block, the old `html, body { @apply bg-white dark:bg-gray-950; }` rule and its `prefers-color-scheme` media query, and the unused legacy `composer-body`/`composer-editor-*`/`sent-delivered-badge`/`header-area` blocks (verified via grep that no `.tsx`/`.ts` file under `app/` references any of those class names).

- [ ] **Step 2: Visual sanity check**

Run: `npm run dev`, open the app in a browser.
Expected: page background is dark blue, no flash of white/light content (no FOUC), since `class="dark"` will be set statically once Task 2 lands (this step may still show light shadcn primitives until Task 2/3 — that's expected at this point; just confirm no console CSS errors).

- [ ] **Step 3: Commit**

```bash
git add app/app.css
git commit -m "feat: retokenize app.css to single dark-blue theme"
```

---

## Task 2: Force dark mode permanently in `app/root.tsx`

**Files:**
- Modify: `app/root.tsx:27-29` (the `Layout` function's `<html>` tag)

**Interfaces:**
- Consumes: the `.dark` class selector defined in Task 1.
- Produces: every page in the app rendering with `<html class="dark">` server-side, with no client-side toggle logic anywhere (none exists today, so this is purely additive).

- [ ] **Step 1: Edit the `<html>` tag**

In `app/root.tsx`, change:

```tsx
export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
```

to:

```tsx
export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="dark">
```

(`lang="es"` matches the Spanish UI copy already used throughout the app; this was a pre-existing inconsistency worth fixing while touching this line.)

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/root.tsx
git commit -m "feat: force permanent dark mode on html element"
```

---

## Task 3: Reinstall shadcn ui primitives from a clean slate

**Files:**
- Delete then recreate: `app/components/ui/*` (button, input, label, select, dialog, table, card, badge, form, sonner, skeleton, dropdown-menu, tabs, textarea, alert, popover, calendar, avatar, breadcrumb, chart, separator, sheet, sidebar, tooltip)

**Interfaces:**
- Consumes: tokens from Task 1, `components.json` config (`style: radix-nova`, `baseColor: neutral`, `cssVariables: true`).
- Produces: every primitive imported by `app/components/layout/*` and every route file — same export names/paths as today (`Button`, `Input`, `Badge`, `badgeVariants`, etc.), so no consuming file needs an import change.

- [ ] **Step 1: Delete the existing primitives**

Run: `rm -rf app/components/ui` (or delete the directory via your file tool — keep `app/components/ui/form.tsx` out of scope only if it doesn't exist yet; per `.wolf/anatomy.md` it currently does not exist in `app/components/ui/`, only `badge.tsx` does, so this directory currently has exactly one file).

- [ ] **Step 2: Reinstall every primitive used by the app**

Run:
```bash
npx shadcn add button input label select dialog table card badge form sonner skeleton dropdown-menu tabs textarea alert popover calendar avatar breadcrumb chart separator sheet sidebar tooltip
```
Expected: all files recreated under `app/components/ui/`, no prompts beyond confirming defaults (CLI reads `components.json` for style/base color/aliases).

- [ ] **Step 3: Restore the custom `success` badge variant**

The stock shadcn `badge.tsx` does not include a `success` variant, but `app/lib/windowStatus.ts` (`WINDOW_STATUS_BADGE_VARIANT`) requires one. Open the freshly-generated `app/components/ui/badge.tsx` and add a `success` key to the `variants.variant` object in its `cva(...)` call, alongside the stock `default`/`secondary`/`destructive`/`outline`/`ghost`/`link` keys generated by the CLI:

```ts
success:
  "bg-green-600/10 text-green-700 dark:bg-green-500/15 dark:text-green-400",
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS — confirms every consuming file (`app/components/layout/*`, every route) still resolves the same exports from the regenerated primitives.

- [ ] **Step 5: Visual sanity check**

Run: `npm run dev`, open `/login` and (after logging in) `/`.
Expected: dark-blue background, buttons/cards/badges render in the new palette with no light-theme remnants.

- [ ] **Step 6: Commit**

```bash
git add app/components/ui
git commit -m "chore: reinstall shadcn ui primitives on the dark-blue theme"
```

---

## Task 4: Rebuild the login page

**Files:**
- Modify: `app/routes/auth/login.tsx` (full rewrite of the component; `action` untouched)

**Interfaces:**
- Consumes: `Card`/`CardContent`/`CardHeader`/`CardTitle`/`CardDescription` and `Button` from `app/components/ui/card` and `app/components/ui/button` (Task 3).
- Produces: no change to the exported `action` (still redirects to the MSAL auth URL) — only the default-exported component changes.

- [ ] **Step 1: Replace the component**

```tsx
import { redirect, Form } from "react-router";
import { Warehouse } from "lucide-react";

import { msalClient, REDIRECT_URI } from "~/lib/microsoft.server";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";

export async function action() {
  const authUrl = await msalClient.getAuthCodeUrl({
    scopes: ["User.Read"],
    redirectUri: REDIRECT_URI,
  });

  return redirect(authUrl);
}

export default function LoginPage() {
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
        <CardContent>
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

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Visual check**

Run: `npm run dev`, visit `/login`.
Expected: centered card on a dark-blue background, primary-blue "Iniciar sesión con Microsoft" button, no leftover `border p-2`/`hover:bg-gray-50` styling.

- [ ] **Step 4: Commit**

```bash
git add app/routes/auth/login.tsx
git commit -m "feat: rebuild login page on the dark-blue theme"
```

---

## Task 5: Confirm layout components need no code changes

**Files:**
- Read-only check: `app/components/layout/AppSidebar.tsx`, `app/components/layout/PageHeader.tsx`, `app/components/layout/TableCard.tsx`, `app/components/layout/EmptyState.tsx`, `app/components/layout/UserMenu.tsx`

**Interfaces:**
- Consumes: tokens from Task 1, primitives from Task 3.
- Produces: nothing new — this task documents why these five files are not rewritten, satisfying the design spec's "layout components rewritten from scratch" intent without introducing risk by touching working code that has no hardcoded colors.

- [ ] **Step 1: Re-confirm each file is fully token-driven**

Grep each file for any color utility that is not one of `bg-primary`, `text-muted-foreground`, `bg-accent`, `bg-sidebar*`, `text-foreground`, `border` (the semantic token classes), e.g.:

```bash
grep -nE "(bg|text|border)-(red|green|blue|slate|gray|zinc|neutral|white|black)-[0-9]" app/components/layout/*.tsx
```

Expected: no matches. All five files (`AppSidebar.tsx`, `PageHeader.tsx`, `TableCard.tsx`, `EmptyState.tsx`, `UserMenu.tsx`) already use only semantic tokens (confirmed during plan research) and the active-nav-item styling in `app.css` (`[data-sidebar="menu-button"][data-active="true"]`, rewritten in Task 1) drives their only theme-dependent visual via `var(--primary)` — so they pick up the new dark-blue palette automatically with zero edits.

- [ ] **Step 2: Visual check**

Run: `npm run dev`, open any authenticated page.
Expected: sidebar, page headers, table cards, empty states, and the user menu all render in the dark-blue palette; the active sidebar nav item shows a primary-blue tinted background.

(No commit — no files change in this task.)

---

## Task 6: Full visual verification pass across every route

**Files:**
- No file changes expected unless a regression is found (in which case: fix in the relevant file from Tasks 1–4, or note the one-off fix here before committing).

**Interfaces:**
- Consumes: everything from Tasks 1–4. This task does not introduce new interfaces; it confirms the existing ones (every route file's reliance on semantic `bg-*`/`text-*`/`border-*` token classes, none of which were touched in this plan beyond Tasks 1–4) render correctly under the new palette.

- [ ] **Step 1: Start the dev server and full stack**

Run: `docker-compose up -d postgres` (if not already running), then `npm run dev`.

- [ ] **Step 2: Walk every route as each role**

Visit and visually confirm dark-blue consistency (no white/light flashes, adequate text contrast, sidebar/topbar/cards all on-palette) for:
- `/login`
- `/` as VENTAS, CARGA, DESCARGA, and ADMINISTRADOR (four different dashboard branches in `_root.tsx`)
- `/calendar` — specifically check the FullCalendar grid lines, header cells, and "today" highlight against the `.fc` overrides from Task 1
- `/windows/new`, `/windows/:id` (any existing window id)
- `/admin/warehouses`, `/admin/tiers`, `/admin/clients`, `/admin/users`, `/admin/overrides`, `/admin/activity`
- `/reports`
- Sidebar collapsed-to-icons and mobile overlay state (resize the browser / use the `SidebarTrigger`)

- [ ] **Step 3: Confirm the QR dialog is intentionally exempt**

Open any window detail page's QR dialog (`WindowQrDialog`). Confirm its container still renders on a white background (`bg-white p-4` in `app/components/qr/WindowQrDialog.tsx`) — this is intentional and must NOT be changed to a dark background, since QR codes require high-contrast light backgrounds to remain reliably scannable by phone cameras.

- [ ] **Step 4: Run the full automated check**

Run: `npm run typecheck && npm test`
Expected: typecheck PASS; `npm test` PASS with the existing `windowOverlap.test.ts` suite unchanged (9 tests, per Task 4 of the original `2026-06-18-shipment-window-scheduler.md` plan).

- [ ] **Step 5: Commit any fixes found during the walk**

If Step 2 surfaced a contrast/color issue not covered by Tasks 1–4, fix it in place and commit:

```bash
git add <fixed files>
git commit -m "fix: address dark-theme contrast issue in <area>"
```

If no issues were found, skip this step — there is nothing to commit.
