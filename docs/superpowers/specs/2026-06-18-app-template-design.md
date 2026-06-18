# App template design (2026-06-18)

## Goal

Convert the existing "scheduler" (reminder emails) app into a clean, generic
fullstack starter template: React Router v7 + Entra ID auth + email sending +
Postgres/Prisma + Docker. All reminder-specific business logic and UI is
removed so the template is ready for new business logic/UI to be built on
top of it.

## Keep

- **Auth (Entra ID / MSAL)**: `app/lib/microsoft.server.ts`,
  `app/lib/session.server.ts`, `app/services/auth-server.ts`
  (`findOrCreateUser`), routes `auth/login`, `auth/callback`, `logout`,
  `auth/layout`.
- **Email**: `app/services/email.server.ts` reduced to one generic
  `sendEmail({ fromEmail, subject, toAddresses, ccAddresses, bodyHtml,
  attachments })` function using MS Graph `sendMail`. Inline CID image
  rewriting logic and `searchEntraUsers` are dropped (business-specific).
- **Routing pattern**: `app/routes.ts` nested layout config (`layout()` +
  `index()`/`route()`), same react-router v7 style.
- **DB**: Prisma + Postgres. Only the `User` model remains (`id`, `email`,
  `createdAt`, `updatedAt`). `Reminder` model removed. Migration history is
  squashed into a single clean `init` migration.
- **Docker**: multi-stage `Dockerfile`, `docker-compose.yml` (app + postgres
  with healthcheck), `docker-entrypoint.sh` (`prisma migrate deploy` then
  start). Naming updated from `scheduler` to `app-template`.
- **Dashboard shell**: protected layout (`requireUserId` in loader) rendering
  a minimal welcome page (user's email + logout button). No sidebar/header.
- Tailwind v4 + `components.json` (shadcn) stay configured, but no
  prebuilt UI components ship — use `npx shadcn add <component>` as needed.

## Remove

- Job queue: `pg-boss` dependency, `boss.server.ts`, `worker.server.ts`,
  `tasks.server.ts`, `reminders.server.ts`.
- Tiptap: all of `app/components/tiptap-*`, `rich-body-editor.tsx`, the
  tiptap-only hooks in `app/hooks/*`, `@tiptap/*` deps, `sass`/`sass-embedded`
  deps, `app/styles/*.scss`, `scss.d.ts`.
- Business UI components: `app-sidebar.tsx`, `nav-user.tsx`, `site-header.tsx`,
  `search-form.tsx`, `reminder-composer.tsx`, `auth-form.tsx` (already empty).
- Business routes: `upcoming.tsx`, `upcoming-detail.tsx`, `sent.tsx`,
  `sent-detail.tsx`, `drafts.tsx`, `drafts-detail.tsx`, `new-reminder.tsx`,
  `search.tsx`, `api.contacts.search.tsx`, `api.reminders.search.tsx`.
- `app/components/ui/*` (all unused once the sidebar/header shell is gone),
  `app/hooks/*` (every hook there is tiptap/sidebar-only).
- Orphaned dependencies: `@tiptap/*`, `pg-boss`, `bcryptjs`, `lucide-react`,
  `@floating-ui/react`, `radix-ui`, `@radix-ui/*`, `vaul`, `lodash.throttle`,
  `react-hotkeys-hook`, `@base-ui/react`, `sass`, `sass-embedded`.

## Renaming

`scheduler` → `app-template` in `package.json` name, docker-compose
container names, default DB name.

## Result

A minimal but fully working fullstack skeleton: login via Entra ID → session
cookie → protected dashboard → logout, with Prisma/Postgres wired and a
generic `sendEmail` helper available, all running via `docker compose up`.
