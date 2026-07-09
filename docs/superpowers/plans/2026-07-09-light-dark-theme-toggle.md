# Light/Dark Theme Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a light theme alongside the existing dark theme, with a manual toggle in `UserMenu`, persisted in `localStorage`, with no flash of the wrong theme on load.

**Architecture:** Pure client-side, class-based theming reusing the app's existing Tailwind `dark:` variant (`@custom-variant dark (&:is(.dark *))` in `app/app.css`). No React context/provider — `root.tsx`'s inline `<head>` script and `UserMenu.tsx`'s toggle handler communicate only through `document.documentElement`'s `dark` class and `localStorage.theme`, never through React state shared between them.

**Tech Stack:** React Router v7 (SSR), Tailwind CSS v4, shadcn/ui, `lucide-react` icons. No new dependencies.

## Global Constraints

- No new dependency (no `next-themes`) — hand-roll using the existing `.dark`-class infrastructure.
- No flash of the wrong theme on first paint.
- Preference persists in `localStorage` only (per browser/device) — no backend/schema changes.
- No changes to business logic, loaders/actions, Prisma schema, or routes — presentation-layer only.
- Default theme (no stored preference) is **dark**, so existing users see no visual change until they toggle.
- Reference spec: `docs/superpowers/specs/2026-07-09-light-dark-theme-toggle-design.md`.

---

### Task 1: Light theme palette + remove hardcoded `color-scheme`

**Files:**
- Modify: `app/app.css:13-16` (remove), `app/app.css:61-101` (comment + `.dark` block — insert new `:root` block above `.dark`, update comment)

**Interfaces:**
- Consumes: nothing (pure CSS).
- Produces: every CSS variable consumed by `@theme inline` (`app/app.css:18-59`) now has both a light (`:root`) and dark (`.dark`) value — no code changes needed to that block, it already reads through `var(--foreground)` etc.

- [ ] **Step 1: Remove the hardcoded dark-only `color-scheme` rule**

In `app/app.css`, delete this block (currently lines 13-16):

```css
html,
body {
  color-scheme: dark;
}
```

`color-scheme` will instead be set inline by the `<head>` script (Task 2) and the toggle handler (Task 3), matching whichever theme is actually active.

- [ ] **Step 2: Replace the single-theme comment with a two-theme comment, and add the `:root` (light) block above `.dark`**

Find this comment + block (currently starting at what was line 61, now a few lines earlier after Step 1's deletion):

```css
/*
 * Single dark-blue theme. The `.dark` selector is kept (rather than renamed
 * to `:root`) because shadcn-generated components emit `dark:` utility
 * classes for things outside the CSS-variable system (e.g. focus ring
 * opacity). `<html class="dark">` is set permanently in app/root.tsx so
 * those utilities stay active with no toggle and no light fallback.
 */
.dark {
  --background: oklch(0.19 0.025 255);
  --foreground: oklch(0.95 0.01 255);
  --card: oklch(0.235 0.03 255);
  --card-foreground: oklch(0.95 0.01 255);
  --popover: oklch(0.235 0.03 255);
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
  --sidebar: oklch(0.16 0.02 255);
  --sidebar-foreground: oklch(0.95 0.01 255);
  --sidebar-primary: oklch(0.62 0.19 255);
  --sidebar-primary-foreground: oklch(0.98 0 0);
  --sidebar-accent: oklch(0.24 0.04 255);
  --sidebar-accent-foreground: oklch(0.95 0.01 255);
  --sidebar-border: oklch(1 0 0 / 8%);
  --sidebar-ring: oklch(0.62 0.19 255);
}
```

Replace it with (new comment + new `:root` block, followed by the **unchanged** `.dark` block):

```css
/*
 * Two themes sharing the same blue hue (255): `:root` (light, default) and
 * `.dark` (the original dark-blue theme, applied when <html> has the "dark"
 * class). The class is set to "dark" server-side by default in
 * app/root.tsx and removed client-side by an inline <head> script when the
 * user has chosen light (see app/root.tsx) — never toggled via a React
 * re-render, so there's no flash and no hydration-driven repaint.
 */
:root {
  --background: oklch(0.99 0.005 255);
  --foreground: oklch(0.20 0.02 255);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.20 0.02 255);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.20 0.02 255);
  --primary: oklch(0.55 0.19 255);
  --primary-foreground: oklch(0.98 0 0);
  --secondary: oklch(0.95 0.01 255);
  --secondary-foreground: oklch(0.25 0.02 255);
  --muted: oklch(0.96 0.008 255);
  --muted-foreground: oklch(0.50 0.02 255);
  --accent: oklch(0.93 0.02 255);
  --accent-foreground: oklch(0.25 0.02 255);
  --destructive: oklch(0.58 0.21 25);
  --border: oklch(0 0 0 / 8%);
  --input: oklch(0 0 0 / 12%);
  --ring: oklch(0.55 0.19 255);
  --chart-1: oklch(0.55 0.19 255);
  --chart-2: oklch(0.60 0.15 220);
  --chart-3: oklch(0.48 0.16 270);
  --chart-4: oklch(0.65 0.12 230);
  --chart-5: oklch(0.40 0.14 255);
  --radius: 0.625rem;
  --sidebar: oklch(0.97 0.008 255);
  --sidebar-foreground: oklch(0.20 0.02 255);
  --sidebar-primary: oklch(0.55 0.19 255);
  --sidebar-primary-foreground: oklch(0.98 0 0);
  --sidebar-accent: oklch(0.92 0.02 255);
  --sidebar-accent-foreground: oklch(0.20 0.02 255);
  --sidebar-border: oklch(0 0 0 / 8%);
  --sidebar-ring: oklch(0.55 0.19 255);
}

.dark {
  --background: oklch(0.19 0.025 255);
  --foreground: oklch(0.95 0.01 255);
  --card: oklch(0.235 0.03 255);
  --card-foreground: oklch(0.95 0.01 255);
  --popover: oklch(0.235 0.03 255);
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
  --sidebar: oklch(0.16 0.02 255);
  --sidebar-foreground: oklch(0.95 0.01 255);
  --sidebar-primary: oklch(0.62 0.19 255);
  --sidebar-primary-foreground: oklch(0.98 0 0);
  --sidebar-accent: oklch(0.24 0.04 255);
  --sidebar-accent-foreground: oklch(0.95 0.01 255);
  --sidebar-border: oklch(1 0 0 / 8%);
  --sidebar-ring: oklch(0.62 0.19 255);
}
```

- [ ] **Step 3: Run typecheck to confirm nothing broke**

Run: `npm run typecheck`
Expected: passes with no output (CSS-only change, but confirms the build pipeline — `react-router typegen && tsc` — is still healthy before continuing).

- [ ] **Step 4: Commit**

```bash
git add app/app.css
git commit -m "feat: add light theme palette alongside existing dark theme"
```

---

### Task 2: Blocking theme script + blob opacity in `root.tsx`

**Files:**
- Modify: `app/root.tsx:33-56` (the `Layout` function)

**Interfaces:**
- Consumes: `localStorage.theme` (string `"light" | "dark" | null`, read-only here).
- Produces: on page load, `document.documentElement` has class `dark` present (default/no preference/dark) or absent (light), and `document.documentElement.style.colorScheme` matches. Task 3's toggle relies on this same convention (`classList.contains("dark")`) to detect the current theme on mount.

- [ ] **Step 1: Add `suppressHydrationWarning` to `<html>` and an inline blocking script in `<head>`**

In `app/root.tsx`, replace the `Layout` function:

```tsx
export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="dark">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
          <div className="animate-blob-drift absolute -top-40 -left-40 h-[600px] w-[600px] rounded-full bg-[oklch(0.58_0.22_255)] opacity-30 blur-[130px]" />
          <div className="animate-blob-drift [animation-delay:-7s] absolute -top-24 -right-32 h-[500px] w-[500px] rounded-full bg-[oklch(0.6_0.20_340)] opacity-20 blur-[130px]" />
          <div className="animate-blob-drift [animation-delay:-13s] absolute -bottom-40 -left-20 h-[520px] w-[520px] rounded-full bg-[oklch(0.65_0.16_195)] opacity-20 blur-[130px]" />
          <div className="animate-blob-drift [animation-delay:-4s] absolute -bottom-32 -right-40 h-[420px] w-[420px] rounded-full bg-[oklch(0.55_0.20_300)] opacity-15 blur-[130px]" />
        </div>
        {children}
        <Toaster />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
```

with:

```tsx
const THEME_INIT_SCRIPT = `try {
  if (localStorage.getItem("theme") === "light") {
    document.documentElement.classList.remove("dark");
    document.documentElement.style.colorScheme = "light";
  }
} catch (e) {}`;

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="dark" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <Meta />
        <Links />
      </head>
      <body>
        <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
          <div className="animate-blob-drift absolute -top-40 -left-40 h-[600px] w-[600px] rounded-full bg-[oklch(0.58_0.22_255)] opacity-10 dark:opacity-30 blur-[130px]" />
          <div className="animate-blob-drift [animation-delay:-7s] absolute -top-24 -right-32 h-[500px] w-[500px] rounded-full bg-[oklch(0.6_0.20_340)] opacity-10 dark:opacity-20 blur-[130px]" />
          <div className="animate-blob-drift [animation-delay:-13s] absolute -bottom-40 -left-20 h-[520px] w-[520px] rounded-full bg-[oklch(0.65_0.16_195)] opacity-10 dark:opacity-20 blur-[130px]" />
          <div className="animate-blob-drift [animation-delay:-4s] absolute -bottom-32 -right-40 h-[420px] w-[420px] rounded-full bg-[oklch(0.55_0.20_300)] opacity-10 dark:opacity-15 blur-[130px]" />
        </div>
        {children}
        <Toaster />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
```

The script must run as a plain `<script>` tag (not through React Router's `<Scripts/>`, which loads the hydration bundle too late to prevent a flash) and must sit before `<Meta />`/`<Links />` so it executes as early as possible during HTML parsing.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: passes with no output.

- [ ] **Step 3: Commit**

```bash
git add app/root.tsx
git commit -m "feat: add blocking theme-init script and fade background blobs in light mode"
```

---

### Task 3: Theme toggle in `UserMenu`

**Files:**
- Modify: `app/components/layout/UserMenu.tsx` (entire file)

**Interfaces:**
- Consumes: `document.documentElement.classList` (reads `"dark"` presence on mount, set by Task 2's script), `localStorage.theme` (writes on toggle).
- Produces: nothing consumed by other tasks — this is the last piece, a self-contained UI control.

- [ ] **Step 1: Rewrite `UserMenu.tsx` with the theme toggle**

Replace the full contents of `app/components/layout/UserMenu.tsx`:

```tsx
import { LogOut, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { Avatar, AvatarFallback } from "~/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";

function initials(email: string) {
  return email.slice(0, 2).toUpperCase();
}

export function UserMenu({ email }: { email: string }) {
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  useEffect(() => {
    setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.classList.toggle("dark", next === "dark");
    document.documentElement.style.colorScheme = next;
    localStorage.setItem("theme", next);
    setTheme(next);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent">
          <Avatar className="size-7">
            <AvatarFallback className="bg-primary/10 text-xs text-primary">
              {initials(email)}
            </AvatarFallback>
          </Avatar>
          <span className="hidden text-sm font-medium sm:inline">{email}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>{email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={toggleTheme}>
          {theme === "dark" ? (
            <>
              <Sun className="size-4" />
              Tema claro
            </>
          ) : (
            <>
              <Moon className="size-4" />
              Tema oscuro
            </>
          )}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <form method="post" action="/logout" className="w-full">
            <button type="submit" className="flex w-full items-center gap-2">
              <LogOut className="size-4" />
              Cerrar sesión
            </button>
          </form>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

Notes for the implementer:
- `theme` state is initialized to `"dark"` unconditionally (matching the server-rendered `<html class="dark">` from Task 2) and corrected in the `useEffect` on mount — this avoids a hydration mismatch warning, since the initial client render before the effect runs must match what the server sent.
- `DropdownMenuItem` (`app/components/ui/dropdown-menu.tsx:74`) already applies `flex items-center gap-1.5` and `cursor-pointer` to every item, so the `<Sun>`/`<Moon>` icon + label render correctly as direct children with no extra wrapper — same pattern as every other icon-bearing item in this codebase.
- The label text describes the theme you'll switch **to** (seeing "Tema claro" while in dark mode, click it to go light), matching the icon shown.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: passes with no output.

- [ ] **Step 3: Run the test suite**

Run: `npm run test`
Expected: `38 passed (38)` (or higher if other work landed since) — this task touches no business logic, so the existing suite must stay fully green.

- [ ] **Step 4: Commit**

```bash
git add app/components/layout/UserMenu.tsx
git commit -m "feat: add light/dark theme toggle to UserMenu"
```

---

### Task 4: Manual visual verification

**Files:** none (verification only).

**Interfaces:** none.

- [ ] **Step 1: Run design QC in dark mode (default)**

Run: `openwolf designqc --routes / /calendar /admin/users`
Expected: screenshots saved to `.wolf/designqc-captures/`. Read them and confirm the dark theme renders exactly as it did before this change (no regression from the `:root` addition or the blob opacity change — dark mode blob opacity is unchanged at 30/20/20/15).

- [ ] **Step 2: Manually toggle to light and re-run design QC**

In a browser against the running dev/preview server: open the app, click the avatar menu, click "Tema claro". Confirm:
- No console errors.
- Background, cards, text, sidebar, and table rows switch to the light palette immediately (no page reload).
- Background blobs are visible but subtle (10% opacity), not overwhelming the white background.

Then run: `openwolf designqc --routes / /calendar /admin/users`
Read the new screenshots and check contrast/readability (text legible on `--card`/`--background`, `--primary` buttons readable, table borders visible against `--border`). Note any specific contrast problems for follow-up — the palette in Task 1 is a first pass per the spec, minor oklch adjustments are expected and don't require a new spec.

- [ ] **Step 3: Confirm persistence and no-flash across reloads**

With light mode active, reload the page (`F5`). Expected: the page loads directly in light mode, no visible flash of dark before it switches.
Toggle back to dark, reload again. Expected: loads directly in dark mode, no flash.

- [ ] **Step 4: Confirm default-dark behavior for users with no stored preference**

Open the app in a private/incognito window (empty `localStorage`). Expected: loads in dark mode, matching current production behavior for all existing users.

- [ ] **Step 5: Update OpenWolf memory**

Per `.wolf/OPENWOLF.md`, append a one-line entry to `.wolf/memory.md` summarizing this session's changes, and update `.wolf/anatomy.md` for `app/app.css`, `app/root.tsx`, and `app/components/layout/UserMenu.tsx` to reflect the theme-toggle behavior now present in each.
