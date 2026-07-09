# Light/Dark Theme Toggle — Design

> Status: approved by user 2026-07-09

## Problem

The app currently ships a single always-on dark-blue theme (`2026-06-24-dark-blue-frontend-remake-design.md` explicitly removed `next-themes` and any toggle, collapsing `:root`/`.dark` into one token set). The user now wants a light theme added back and a manual toggle to switch between the two, superseding that "single dark theme only" constraint. The current dark theme becomes the `.dark` variant; a new light theme becomes the default (`:root`).

## Constraints

- No new dependency — hand-roll the toggle using the `.dark`-class + Tailwind `dark:` variant infrastructure already present in `app/app.css` (`@custom-variant dark (&:is(.dark *))`), rather than reintroducing `next-themes`.
- No flash of the wrong theme on load (no visible light→dark or dark→light flicker on first paint).
- Preference persists in `localStorage` only (per browser/device, not synced across devices or accounts) — confirmed with user, no backend/schema changes.
- No changes to business logic, loaders/actions, Prisma schema, or routes — presentation-layer only.
- Default for anyone with no stored preference (including all current users on first load after this ships) is **dark**, so existing users see no visual change until they explicitly toggle.

## Design

### 1. Theme storage & flash prevention

- Preference key: `localStorage.theme`, value `"light"` or `"dark"`. Absence of the key means dark (today's only theme).
- `app/root.tsx`'s `<html>` keeps `className="dark"` (current behavior) for SSR and no-JS clients — the server always renders dark markup, and `suppressHydrationWarning` is added to `<html>` since a client script may mutate its class before React hydrates.
- A small inline `<script>` is added directly in `<head>` in the `Layout` function (plain HTML text via `dangerouslySetInnerHTML`, **not** React Router's `<Scripts/>` bundle, which loads too late) that runs synchronously during HTML parsing, before first paint:
  ```js
  try {
    if (localStorage.getItem("theme") === "light") {
      document.documentElement.classList.remove("dark");
      document.documentElement.style.colorScheme = "light";
    }
  } catch {}
  ```
- The static `html, body { color-scheme: dark; }` rule in `app.css` is removed — `color-scheme` is now set inline per-theme (by the head script on load, and by the toggle handler on change) rather than hardcoded in CSS.

### 2. Light palette (`app/app.css`)

Add a `:root { ... }` block (currently absent) mirroring every CSS variable defined in `.dark`, same blue hue family (255) but light backgrounds / dark text, e.g.:

- `--background: oklch(0.99 0.005 255)`, `--foreground: oklch(0.20 0.02 255)`
- `--card` / `--popover: oklch(1 0 0)` (pure white, one step lighter than background)
- `--primary: oklch(0.55 0.19 255)` (slightly darker than the dark theme's primary for sufficient contrast on white), `--primary-foreground: oklch(0.98 0 0)`
- `--muted: oklch(0.96 0.008 255)`, `--muted-foreground: oklch(0.50 0.02 255)`
- `--border`/`--input`: translucent **black** (`oklch(0 0 0 / 8%)` / `12%`) instead of translucent white
- `--sidebar*` tokens: same relationship to `--card` as today's dark theme (one step off main background), light equivalents
- `--chart-1..5`: same hues as `.dark`, lightness/chroma retuned for a white backdrop
- `.dark { ... }` block is otherwise unchanged (today's exact values).
- Exact oklch values are a first pass — acceptable to fine-tune after visual QC (contrast, "looks washed out/too saturated") without a spec update.

### 3. Background blobs (`app/root.tsx`)

The 4 blurred gradient "blob" divs were tuned for a dark backdrop (20-30% opacity). Rather than removing them for light mode (losing the "living background" feel), fade them via Tailwind `dark:` variants: a low default opacity class plus a `dark:opacity-*` override restoring today's values, e.g. `opacity-10 dark:opacity-30`. Applied per-blob since they already have slightly different base opacities.

### 4. Toggle UI (`app/components/layout/UserMenu.tsx`)

- New `DropdownMenuItem` above the existing "Cerrar sesión" item (separated by the existing `DropdownMenuSeparator`, or a new one if needed).
- Icon: `Sun` (lucide-react) when currently dark ("switch to light"), `Moon` when currently light ("switch to dark"). Label: "Tema claro" / "Tema oscuro" respectively (label describes the theme you'll switch **to**, matching the icon).
- Local component state tracks the current theme for icon/label; initialized to `"dark"` unconditionally (matching SSR output, avoiding a hydration mismatch) and corrected in a `useEffect` on mount by reading `document.documentElement.classList.contains("dark")` (the head script has already set the real class by then).
- Click handler toggles `document.documentElement.classList`, sets `document.documentElement.style.colorScheme`, writes `localStorage.theme`, and updates the component state — no navigation, no page reload.
- This logic (read current / toggle / persist) is small enough to inline in `UserMenu.tsx` directly; no separate theme-context/provider needed given it's a single consumer.

## Testing

- `npm run typecheck` and `npm run test` must stay green (no business logic touched).
- No unit-testable logic here (DOM class mutation + `localStorage` side effects) — verification is manual/visual:
  - `openwolf designqc` on dashboard, calendar, and one admin CRUD table in both themes, checking contrast/readability and that no component is left unstyled (hardcoded colors bleeding through).
  - Manual check: toggle light→dark→light, reload the page after each, confirm no flash and the correct theme persists.
  - Manual check: clear `localStorage` (or open in a fresh profile) and confirm the app loads dark by default, matching current production behavior.

## Out of scope

- Cross-device/account-synced theme preference (would require a `User` schema change — explicitly deferred).
- Following OS-level `prefers-color-scheme` automatically — the toggle is manual only, matching what was asked for.
- Any change to business logic, routes, Prisma schema, or non-visual behavior.
- Retuning literal (non-token) Tailwind colors elsewhere in the app (e.g. `calendar.tsx`'s `STATUS_LEGEND` `bg-slate-500`/`bg-amber-600`/etc., status badge colors) — these are not CSS-variable-driven and already read reasonably on both light and dark backgrounds; revisit only if QC finds a specific contrast problem.
