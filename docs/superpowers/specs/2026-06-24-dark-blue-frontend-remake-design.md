# Dark Blue Frontend Remake — Design

> Status: approved by user 2026-06-24

## Problem

The shipment-window-scheduler frontend (React Router v7 + shadcn) currently uses a light "Microsoft Outlook" theme (MS Blue `#0078D4`, light background, `next-themes` light/dark toggle), built under the `2026-06-24-saas-ui-refactor-design.md` spec, which explicitly forbade changing colors/theme. The user now wants the opposite: a full visual remake of the entire frontend into a single, always-on dark blue theme (Linear/Vercel-style SaaS aesthetic), superseding that prior constraint. Business logic, data, routes, and permissions must not change — this is presentation-layer only, but the visual layer is rebuilt from scratch (deleted and recreated), not just retouched.

## Constraints

- Single dark theme only — no light mode, no theme toggle. Remove `next-themes` usage and the `.dark` conditional class split in `app/app.css`; collapse to one token set.
- No changes to loaders/actions, Prisma schema, API routes, or business/validation logic (`windowOverlap.ts`, role checks, conflict detection, etc.).
- No new business features, no pagination/search additions, no fabricated metrics.
- UI copy stays in Spanish (es-MX).
- All shadcn primitives are deleted and reinstalled via the shadcn CLI (clean slate), then retokenized — not hand-patched.
- FullCalendar (`resourceTimeline`) needs hand-written CSS overrides since it doesn't consume shadcn CSS variables.

## Design

### 1. Color system (`app/app.css`)

Replace `:root`/`.dark` split with one token set (always dark):

- `--background`: near-black with a perceptible blue tint (`oklch(~0.14 0.02 250)`).
- `--card` / `--popover`: one step lighter than background, for layered depth (no hard borders everywhere).
- `--primary`: saturated vibrant blue (`oklch` equivalent of `#2563EB`/`#3B82F6`) — buttons, links, focus rings, active nav state.
- `--foreground`: off-white (not pure white).
- `--muted-foreground`: gray-blue, for secondary text.
- `--border` / `--input`: translucent white (`oklch(1 0 0 / 8%)`), not solid gray.
- `--destructive`/success/warning equivalents: desaturated semantic colors tuned for dark backgrounds (used by status badges).
- `--sidebar*` tokens: same family as `--card`, one step darker than main content area to separate the shell from content.
- Remove the Outlook-specific leftover rules (`header-area`, MS-Blue-specific overrides) that don't apply to this app; keep `composer-body`/editor styles only if still used elsewhere (verify before deleting).
- Remove `next-themes` provider usage in `root.tsx` if present, and any theme-toggle UI.

### 2. shadcn primitives (`app/components/ui/`)

Delete the existing directory contents and reinstall via `npx shadcn add <list>` for: `button`, `input`, `label`, `select`, `dialog`, `table`, `card`, `badge`, `form`, `sonner`, `skeleton`, `dropdown-menu`, `tabs`, `textarea`, `alert`, `popover`, `calendar`, `avatar`, `breadcrumb`, `chart`, `separator`, `sheet`, `sidebar`, `tooltip`. Use a neutral base color (slate/zinc) at install time, then let the retokenized CSS variables in `app.css` drive the actual dark-blue appearance — no per-component hardcoded colors.

### 3. Layout components (`app/components/layout/`)

Rewritten from scratch, same external contract (props/usage) as today so route files don't need logic changes:

- `AppSidebar.tsx` — role-grouped nav (Operación / Administración per `app/lib/navigation.ts`), `lucide-react` icons, active item styled with the new primary-blue accent (replacing the old left-stripe MS-Blue treatment with a design that fits the dark palette — solid tinted background + icon/text in primary color).
- `PageHeader.tsx` — title, optional description, optional right-aligned action slot. Same prop shape.
- `TableCard.tsx`, `EmptyState.tsx` — restyled containers for admin tables / empty states.
- `UserMenu.tsx` — avatar/initials + dropdown (email, "Cerrar sesión"), restyled.
- `dashboard.tsx` (shell) — `SidebarProvider`/`Sidebar`/`SidebarInset` from the new shadcn sidebar, topbar with breadcrumb + `OverrideBadge` + `UserMenu`.

### 4. Login (`app/routes/auth/login.tsx`)

Restyled to match the dark-blue language even though it renders outside the authenticated shell (no sidebar) — centered card on the dark background, primary-blue submit button.

### 5. Page-by-page rebuild (JSX only; loaders/actions untouched)

- `_root.tsx`: admin → `PageHeader` + stat cards + per-warehouse occupancy chart (`chart` component) + pending-overrides card; ventas → action cards; carga/descarga → today's-windows list with status `Badge`.
- `calendar.tsx`: `PageHeader` + status-color legend + FullCalendar with hand-written dark-mode CSS overrides (cell backgrounds, gridlines, text, resource-timeline header) added to `app.css` or a dedicated stylesheet imported by this route.
- `windows/new.tsx`: form sections (Cliente/Nave, Horario, Operador) divided by `Separator`; conflict state shown via `Alert` + icon.
- `windows/detail.tsx`: 2-column definition-list grid inside `Card`; status `Badge` via the existing `app/lib/windowStatus.ts` map (recolored for dark theme); actions in the `PageHeader` action slot.
- `admin/warehouses.tsx`, `admin/tiers.tsx`, `admin/clients.tsx`, `admin/users.tsx`, `admin/overrides.tsx`, `admin/activity.tsx`: same tables, `Badge` for enum/boolean columns, `EmptyState` when empty, dialog forms restyled.
- `reports.tsx`: `PageHeader` with "Exportar a Excel" action, filters in a `Card`, results table with badges.

## Testing

- No business logic changes — existing `windowOverlap.test.ts` suite must stay green untouched.
- `npm run typecheck` must pass after the rebuild.
- Manual verification: visually check every route (admin dashboard, calendar, windows new/detail, each admin CRUD page, reports, login) on desktop and with the sidebar collapsed/mobile-overlay state, confirming dark-blue consistency and adequate contrast (no MS-Blue/light remnants).

## Out of scope

- Database schema, API routes, business/validation logic changes.
- Light mode / theme toggle (explicitly removed).
- Pagination/search additions, fabricated metrics.
- UX/flow redesign — only visual rebuild, same information and actions per page as today.
