# SaaS UI Refactor — Design

> Status: approved by user 2026-06-24

## Problem

The shipment-window-scheduler system (merged to `master`) is functionally complete (21/22 plan tasks) but the UI is visually bare: a plain flex top-nav with text links, raw `<p>` tags for data display, untitled pages with no consistent header pattern, and admin tables with no status badges or empty states. The user wants a modern SaaS look using ShadCN — **without** changing the existing default theme (colors, radius, fonts in `app/app.css`). Only structure/layout/typography-hierarchy/iconography changes; zero new CSS custom properties or Tailwind theme overrides.

Notably, `app.css` already contains unused `--sidebar-*` CSS variables and `[data-sidebar="menu-button"][data-active="true"]` active-state styling — leftover from the template this project was derived from. This confirms a sidebar-based shell is exactly what the theme was built to support.

## Constraints

- No changes to `app/app.css` color tokens, `--radius`, fonts, or dark-mode values.
- Only ShadCN components (official registry, possibly with new component installs: `sidebar`, `chart`, `avatar`, `separator`, `breadcrumb`, `progress` if needed).
- Spanish (es-MX) copy, consistent with existing pages.
- No new business logic, no new API routes, no schema changes — this is presentation-layer only.
- Don't add pagination/search to admin tables (current data volumes are tiny: 4 warehouses, 3 tiers, 5 clients) — would be premature.
- Don't fabricate metrics that don't exist (e.g., no fake "% vs yesterday" trend unless real data backs it).

## New dependency

- `recharts` (via `shadcn add chart`, which wraps it) — for the per-warehouse occupancy bar chart on the admin dashboard. This is the only new package.

## Design

### 1. App Shell

Replace the flat header in `app/routes/dashboard.tsx` with a two-column shell using ShadCN's `sidebar` component (collapsible-to-icons pattern, e.g. `sidebar-07` block as a base).

- **Sidebar**: app name/logo at top. Nav items grouped into two `SidebarGroup`s:
  - "Operación": Inicio (`/`), Calendario (`/calendar`), Nueva ventana (`/windows/new`, only VENTAS/ADMINISTRADOR)
  - "Administración" (ADMINISTRADOR only): Naves, Clientes, Tiers, Usuarios, Excepciones, Actividad, Reportes
  - Each item gets a `lucide-react` icon. Active item styling already defined in `app.css` (`[data-sidebar="menu-button"][data-active="true"]`) — just needs `data-active` wired via `useLocation()` matching.
- **Topbar**: thin bar with breadcrumb (current page title) on the left; `OverrideBadge` + a user dropdown (`DropdownMenu` with avatar/initials, email, "Cerrar sesión") on the right, replacing the bare logout `<button>`.
- Mobile: sidebar collapses to an overlay sheet (built into ShadCN's sidebar component, `useSidebar`/`SidebarTrigger`).

Files touched: `app/routes/dashboard.tsx` (rewrite to use `SidebarProvider`/`Sidebar`/`SidebarInset`), new `app/components/layout/AppSidebar.tsx`, new `app/components/layout/UserMenu.tsx`.

### 2. Dashboard (`app/routes/_root.tsx`)

- **Admin**: `PageHeader` ("Panel de administración", today's date as description) + 4 stat cards (icon + number + label, same metrics as today: scheduled/in-progress/completed/delayed) in a responsive grid + a new **occupancy chart card** (horizontal bar chart, one bar per warehouse, count of today's windows — fetched via existing warehouse/window data already in the loader, extended to group by warehouse) + a new **pending overrides card** (list of up to 5 `PENDING` `OverrideRequest`s with client name + requestedBy, link to `/admin/overrides`).
- **Ventas**: `PageHeader` + two action cards (icon + label) for "Nueva ventana" and "Ver calendario" instead of bare buttons.
- **Carga/Descarga**: `PageHeader` + existing today's-windows list, upgraded with colored status `Badge` and clearer visual hierarchy (client name bold, metadata muted-secondary).

Loader in `_root.tsx` extends the ADMINISTRADOR branch to also fetch: windows-per-warehouse counts (today) and the 5 most recent pending overrides with client name.

### 3. `PageHeader` component

New `app/components/layout/PageHeader.tsx`: title, optional description, optional `action` slot (right-aligned button/element). Used on every admin page, `/reports`, `/calendar`, `/windows/new`, `/windows/:id`, replacing ad-hoc `<h1>` + separately-placed buttons.

### 4. Admin tables (Naves, Tiers, Clientes, Usuarios, Actividad, Overrides)

Same `Table` component, enhanced with:
- `Badge` for boolean/enum columns (Activa Sí/No → green/gray badge; role; tier priority) instead of plain text.
- Empty state (icon + "No hay registros todavía" message) when the list is empty.
- Dialog forms get consistent spacing (already mostly fine, minor polish only).

### 5. Window detail (`app/routes/windows/detail.tsx`)

Replace stacked `<p>` tags with a 2-column definition-list grid inside the `Card` (label muted-small above, value below). Status `Badge` gets semantic coloring (gray=SCHEDULED, blue=IN_PROGRESS, green=COMPLETED, red=CANCELLED) via a shared `WINDOW_STATUS_BADGE` map (new small helper in `app/lib/`, reused by calendar legend too). Actions (Iniciar/Completar/Ver QR) move into the `PageHeader` action slot.

### 6. New window (`app/routes/windows/new.tsx`) and Calendar (`app/routes/calendar.tsx`)

- New window: group existing fields under `Separator`-divided sections (Cliente/Nave, Horario, Operador). Conflict alert gets an icon (ShadCN `Alert` with `AlertTriangle`).
- Calendar: `PageHeader` with a small color-chip legend (Programada/En curso/Completada/Cancelada) reusing the shared status-badge color map from #5.

### 7. Reports (`app/routes/reports.tsx`)

`PageHeader` with "Exportar a Excel" as the action slot. Filters grouped in a `Card` above the results table. Results table reuses the same badge treatment as admin tables.

## Testing

- No new business logic to unit-test. Existing `windowOverlap.test.ts` suite stays green (no logic touched).
- Manual verification: `npm run typecheck`, then visual check of each route via the running dev server / docker stack (admin dashboard, calendar, windows new/detail, each admin CRUD page, reports) across desktop and mobile sidebar-collapsed states.

## Out of scope

- Color/theme/radius/font changes (explicitly forbidden).
- New API routes, schema changes, business logic changes.
- Pagination/search on admin tables.
- Fabricated metrics/trends not backed by real data.
