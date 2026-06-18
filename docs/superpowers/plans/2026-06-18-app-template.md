# App Template Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the existing "scheduler" reminder-emails app into a clean, generic fullstack starter template (React Router v7 + Entra ID auth + email sending + Postgres/Prisma + Docker), with all reminder-specific business logic and UI removed.

**Architecture:** Subtractive refactor of an existing working app. Delete business routes/components/services, simplify the two integration points that stay (email, Prisma schema), then update build/deploy metadata (package.json, Dockerfile, docker-compose, README) to reflect the new generic name `app-template`.

**Tech Stack:** React Router v7 (file-based nested routing via `routes.ts`), Prisma 7 + `@prisma/adapter-pg` + Postgres 16, `@azure/msal-node` (Entra ID OAuth), MS Graph `sendMail` REST API, Tailwind v4 + shadcn (`components.json`), Docker multi-stage build + docker-compose.

## Global Constraints

- No test framework exists in this repo (no `test` script in `package.json`). Verification gates are `npm run typecheck`, `npm run build`, and (final task only) `docker compose up` + manual smoke check. Do not invent a test framework — that's out of scope.
- Spec lives at `docs/superpowers/specs/2026-06-18-app-template-design.md` — every task below traces back to a "Keep" or "Remove" bullet there.
- Project renames from `scheduler` to `app-template`: `package.json` `name`, docker-compose `container_name` values, default Postgres DB name (`scheduler` → `app_template`), `DATABASE_URL` in `.env`.
- Never delete `.env` (it holds real Entra ID credentials) — only edit the `DATABASE_URL` line in place.
- Prisma migrations are squashed into one `init` migration containing only the `User` model (confirmed with user).

---

### Task 1: Remove business routes and update route config

**Files:**
- Delete: `app/routes/upcoming.tsx`
- Delete: `app/routes/upcoming-detail.tsx`
- Delete: `app/routes/sent.tsx`
- Delete: `app/routes/sent-detail.tsx`
- Delete: `app/routes/drafts.tsx`
- Delete: `app/routes/drafts-detail.tsx`
- Delete: `app/routes/new-reminder.tsx`
- Delete: `app/routes/search.tsx`
- Delete: `app/routes/api.contacts.search.tsx`
- Delete: `app/routes/api.reminders.search.tsx`
- Delete: `app/routes/simple.tsx`
- Modify: `app/routes.ts`

**Interfaces:**
- Produces: a `routes.ts` whose only routes are `dashboard` layout wrapping `_root` (index), and the `auth/layout` wrapping `login`/`auth/callback`, plus top-level `logout`. Task 5 (dashboard rewrite) and Task 6 (verification) depend on this shape existing.

- [ ] **Step 1: Delete the business route files**

```bash
rm app/routes/upcoming.tsx app/routes/upcoming-detail.tsx app/routes/sent.tsx app/routes/sent-detail.tsx app/routes/drafts.tsx app/routes/drafts-detail.tsx app/routes/new-reminder.tsx app/routes/search.tsx app/routes/api.contacts.search.tsx app/routes/api.reminders.search.tsx app/routes/simple.tsx
```

- [ ] **Step 2: Rewrite `app/routes.ts` to only reference surviving routes**

```typescript
import {
  type RouteConfig,
  index,
  route,
  layout,
} from "@react-router/dev/routes";

export default [
  layout("./routes/dashboard.tsx", [index("./routes/_root.tsx")]),

  layout("./routes/auth/layout.tsx", [
    route("login", "./routes/auth/login.tsx"),
    route("auth/callback", "./routes/auth/callback.tsx"),
  ]),

  route("logout", "./routes/auth/logout.tsx"),
] satisfies RouteConfig;
```

- [ ] **Step 3: Verify nothing else still imports a deleted route**

```bash
grep -rn "upcoming\|sent-detail\|drafts\|new-reminder\|api.contacts\|api.reminders\|routes/search\|routes/simple" app --include="*.ts" --include="*.tsx"
```

Expected: no output (the route files themselves are gone, so no matches).

- [ ] **Step 4: Commit**

```bash
git add app/routes.ts
git commit -m "Remove reminder-specific routes, keep auth + dashboard skeleton"
```

---

### Task 2: Remove business components, hooks, tiptap, and dead lib files

**Files:**
- Delete: `app/components/tiptap-extension/`, `app/components/tiptap-icons/`, `app/components/tiptap-node/`, `app/components/tiptap-templates/`, `app/components/tiptap-ui/`, `app/components/tiptap-ui-primitive/`
- Delete: `app/components/rich-body-editor.tsx`
- Delete: `app/components/app-sidebar.tsx`
- Delete: `app/components/nav-user.tsx`
- Delete: `app/components/site-header.tsx`
- Delete: `app/components/search-form.tsx`
- Delete: `app/components/reminder-composer.tsx`
- Delete: `app/components/auth-form.tsx` (empty/unused)
- Delete: `app/components/ui/` (entire directory — every component in it is only consumed by files just deleted; confirmed via grep in design phase)
- Delete: `app/hooks/` (entire directory — every hook is tiptap/sidebar-only; confirmed via grep in design phase)
- Delete: `app/lib/types.ts` (reminder rule/attachment types)
- Delete: `app/lib/validators.ts` (unused leftover `createTaskSchema`/password-based `registerSchema`/`loginSchema` — auth is OAuth-only, no password flow exists)
- Delete: `app/lib/auto-save-registry.ts` (tiptap-only)
- Delete: `app/styles/` (scss used only by tiptap)
- Delete: `app/scss.d.ts`
- Modify: `app/root.tsx` (remove `TooltipProvider` import/usage since `ui/tooltip` is gone)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `app/root.tsx` with no dependency on `app/components/ui/*`. Task 6 (dependency cleanup) relies on these deletions to know which npm packages are now orphaned.

- [ ] **Step 1: Delete the directories and files**

```bash
rm -rf app/components/tiptap-extension app/components/tiptap-icons app/components/tiptap-node app/components/tiptap-templates app/components/tiptap-ui app/components/tiptap-ui-primitive
rm app/components/rich-body-editor.tsx app/components/app-sidebar.tsx app/components/nav-user.tsx app/components/site-header.tsx app/components/search-form.tsx app/components/reminder-composer.tsx app/components/auth-form.tsx
rm -rf app/components/ui
rm -rf app/hooks
rm app/lib/types.ts app/lib/validators.ts app/lib/auto-save-registry.ts
rm -rf app/styles
rm app/scss.d.ts
```

- [ ] **Step 2: Update `app/root.tsx` to drop the now-deleted `TooltipProvider`**

```typescript
import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";

import type { Route } from "./+types/root";
import "./app.css";

export const links: Route.LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap",
  },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="pt-16 p-4 container mx-auto">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className="w-full p-4 overflow-x-auto">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
```

- [ ] **Step 3: Verify no file still imports anything deleted in this task**

```bash
grep -rln "components/ui/\|hooks/use-\|tiptap\|lib/types\|lib/validators\|auto-save-registry" app --include="*.ts" --include="*.tsx"
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Remove tiptap, business UI components, unused hooks/lib files"
```

---

### Task 3: Simplify email service and remove job queue

**Files:**
- Modify: `app/services/email.server.ts`
- Delete: `app/services/boss.server.ts`
- Delete: `app/services/worker.server.ts`
- Delete: `app/services/tasks.server.ts`
- Delete: `app/services/reminders.server.ts`

**Interfaces:**
- Produces: `sendEmail({ fromEmail, subject, toAddresses, ccAddresses, bodyHtml, attachments }): Promise<void>` exported from `app/services/email.server.ts`. No other task currently calls it (it's a template utility), but it must compile standalone.

- [ ] **Step 1: Rewrite `app/services/email.server.ts` to a single generic `sendEmail` function**

```typescript
import { msalClient } from "~/lib/microsoft.server";

async function getAppAccessToken(): Promise<string> {
  const result = await msalClient.acquireTokenByClientCredential({
    scopes: ["https://graph.microsoft.com/.default"],
  });
  if (!result?.accessToken) throw new Error("Failed to acquire app access token");
  return result.accessToken;
}

export async function sendEmail({
  fromEmail,
  subject,
  toAddresses,
  ccAddresses = [],
  bodyHtml,
  attachments = [],
}: {
  fromEmail: string;
  subject: string;
  toAddresses: string[];
  ccAddresses?: string[];
  bodyHtml: string;
  attachments?: { name: string; contentType: string; contentBase64: string }[];
}) {
  const token = await getAppAccessToken();

  const message: Record<string, unknown> = {
    subject,
    body: { contentType: "HTML", content: bodyHtml },
    toRecipients: toAddresses.map((a) => ({ emailAddress: { address: a } })),
    ccRecipients: ccAddresses.map((a) => ({ emailAddress: { address: a } })),
  };

  if (attachments.length > 0) {
    message.attachments = attachments.map((a) => ({
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: a.name,
      contentType: a.contentType,
      contentBytes: a.contentBase64,
      isInline: false,
    }));
  }

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(fromEmail)}/sendMail`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph sendMail failed (${res.status}): ${text}`);
  }
}
```

- [ ] **Step 2: Delete the job-queue service files**

```bash
rm app/services/boss.server.ts app/services/worker.server.ts app/services/tasks.server.ts app/services/reminders.server.ts
```

- [ ] **Step 3: Verify nothing still imports the deleted services or `pg-boss`**

```bash
grep -rln "boss.server\|worker.server\|tasks.server\|reminders.server\|pg-boss\|startBoss" app --include="*.ts" --include="*.tsx"
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Simplify email service to generic sendEmail, remove job queue"
```

---

### Task 4: Simplify Prisma schema and squash migrations

**Files:**
- Modify: `prisma/schema.prisma`
- Delete: `prisma/migrations/20260526220924_init/`
- Delete: `prisma/migrations/20260526222622_auth/`
- Delete: `prisma/migrations/20260527160413_auth_msal/`
- Delete: `prisma/migrations/20260602000000_add_reminder/`
- Delete: `prisma/migrations/20260526192759_initial_migration/`
- Create: `prisma/migrations/20260618000000_init/migration.sql`
- Keep: `prisma/migrations/migration_lock.toml` (unchanged)

**Interfaces:**
- Produces: `User` model (`id: Int @id @default(autoincrement())`, `email: String @unique`, `createdAt`, `updatedAt`) — this is what `app/services/auth-server.ts` and `app/services/user.server.ts` already query against, so their code does not change.

- [ ] **Step 1: Rewrite `prisma/schema.prisma` to drop the `Reminder` model**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
}

model User {
  id        Int      @id @default(autoincrement())
  email     String   @unique
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

- [ ] **Step 2: Delete the old migration folders and create a single squashed one**

```bash
rm -rf prisma/migrations/20260526220924_init prisma/migrations/20260526222622_auth prisma/migrations/20260527160413_auth_msal prisma/migrations/20260602000000_add_reminder prisma/migrations/20260526192759_initial_migration
mkdir -p prisma/migrations/20260618000000_init
```

- [ ] **Step 3: Write the squashed migration SQL**

Create `prisma/migrations/20260618000000_init/migration.sql`:

```sql
-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
```

- [ ] **Step 4: Regenerate the Prisma client and confirm the schema is valid**

```bash
npx prisma generate
npx prisma validate
```

Expected: both commands succeed with no errors (this only regenerates the client locally — it does not touch any database).

- [ ] **Step 5: Commit**

```bash
git add prisma
git commit -m "Squash Prisma migrations into single init migration, drop Reminder model"
```

---

### Task 5: Rewrite the dashboard into a minimal authenticated welcome page

**Files:**
- Modify: `app/routes/dashboard.tsx`

**Interfaces:**
- Consumes: `requireUserId(request)` and `logout(request)` from `app/lib/session.server.ts` (unchanged), `prisma` from `app/lib/db.server.ts` (unchanged).
- Produces: a `Dashboard` route component rendering `<Outlet />` for `index("./routes/_root.tsx")` from Task 1's `routes.ts`.

- [ ] **Step 1: Rewrite `app/routes/dashboard.tsx`**

```typescript
import { Outlet, useLoaderData } from "react-router";
import type { Route } from "./+types/dashboard";

import { logout, requireUserId } from "~/lib/session.server";
import { prisma } from "~/lib/db.server";

export async function loader({ request }: Route.LoaderArgs) {
  const userId = await requireUserId(request);
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw await logout(request);
  }
  return { user };
}

export default function Dashboard() {
  const { user } = useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between p-4 border-b">
        <span className="font-medium">{user.email}</span>
        <form method="post" action="/logout">
          <button type="submit" className="border px-3 py-1 rounded hover:bg-gray-50">
            Cerrar sesión
          </button>
        </form>
      </header>
      <main className="flex-1 p-4">
        <Outlet />
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Rewrite `app/routes/_root.tsx` as the minimal welcome content**

Read the current `app/routes/_root.tsx` first to confirm its existing shape, then replace its contents with:

```typescript
export default function Index() {
  return (
    <div>
      <h1 className="text-2xl font-bold">Bienvenido</h1>
      <p className="text-gray-600">Ya tienes sesión iniciada. Empieza a construir aquí.</p>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add app/routes/dashboard.tsx app/routes/_root.tsx
git commit -m "Replace business dashboard with minimal authenticated welcome page"
```

---

### Task 6: Clean up dependencies and rename project to app-template

**Files:**
- Modify: `package.json`
- Modify: `docker-compose.yml`
- Modify: `.env` (only the `DATABASE_URL` line)
- Modify: `README.md`

**Interfaces:**
- Consumes: nothing new — this task only removes now-orphaned dependencies identified in Tasks 1-3 (`@tiptap/*`, `pg-boss`, `bcryptjs`, `lucide-react`, `@floating-ui/react`, `radix-ui`, `@radix-ui/react-dropdown-menu`, `@radix-ui/react-popover`, `vaul`, `lodash.throttle`, `react-hotkeys-hook`, `@base-ui/react`, `sass`, `sass-embedded`).

- [ ] **Step 1: Rewrite `package.json`**

```json
{
  "name": "app-template",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "react-router build",
    "dev": "react-router dev",
    "start": "react-router-serve ./build/server/index.js",
    "typecheck": "react-router typegen && tsc"
  },
  "dependencies": {
    "@azure/msal-node": "^5.2.2",
    "@fontsource-variable/inter": "^5.2.8",
    "@prisma/adapter-pg": "^7.8.0",
    "@prisma/client": "^7.8.0",
    "@react-router/node": "7.15.1",
    "@react-router/serve": "7.15.1",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "isbot": "^5.1.36",
    "pg": "^8.21.0",
    "prisma": "^7.8.0",
    "react": "^19.2.6",
    "react-dom": "^19.2.6",
    "react-router": "7.15.1",
    "tailwind-merge": "^3.6.0",
    "tw-animate-css": "^1.4.0",
    "zod": "^4.4.3"
  },
  "devDependencies": {
    "@react-router/dev": "7.15.1",
    "@tailwindcss/vite": "^4.3.0",
    "@types/node": "^22",
    "@types/pg": "^8.20.0",
    "@types/react": "^19.2.14",
    "@types/react-dom": "^19.2.3",
    "dotenv": "^17.4.2",
    "shadcn": "^4.10.0",
    "tailwindcss": "^4.3.0",
    "typescript": "^5.9.3",
    "vite": "^8.0.3"
  }
}
```

- [ ] **Step 2: Reinstall to regenerate the lockfile cleanly**

```bash
rm -f package-lock.json
npm install
```

Expected: install succeeds with no errors referencing the removed packages.

- [ ] **Step 3: Rename containers and default DB in `docker-compose.yml`**

```yaml
services:

  app:
    build: .
    container_name: app-template-app
    ports:
      - "3010:3000"
    depends_on:
      postgres:
        condition: service_healthy
    restart: unless-stopped

  postgres:
    image: postgres:16-alpine
    container_name: app-template-postgres
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: "1234"
      POSTGRES_DB: app_template
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d app_template"]
      interval: 5s
      timeout: 5s
      retries: 10
    restart: unless-stopped

volumes:
  postgres_data:
```

- [ ] **Step 4: Update the `DATABASE_URL` line in `.env` to match the renamed DB**

Change line 1 of `.env` from:
```
DATABASE_URL="postgresql://postgres:1234@postgres:5432/scheduler"
```
to:
```
DATABASE_URL="postgresql://postgres:1234@postgres:5432/app_template"
```
Leave every other line in `.env` untouched (Entra ID credentials, session secret, mail sender).

- [ ] **Step 5: Update `README.md`** to describe this as the generic template (keep the existing React Router boilerplate sections, just fix the title/intro and Docker section to reference `app-template` and mention Entra ID auth + Postgres + Prisma + the email service):

```markdown
# App Template

A production-ready full-stack starter: React Router v7 + Microsoft Entra ID login + email sending via MS Graph + Postgres/Prisma, fully dockerized.

## Features

- 🔒 Login with Microsoft Entra ID (MSAL, OAuth code flow)
- 🗄️ Postgres + Prisma (`@prisma/adapter-pg`)
- 📧 Generic `sendEmail` helper via MS Graph `sendMail`
- 🐳 Dockerized (multi-stage build + docker-compose with Postgres healthcheck)
- ⚡️ React Router v7 nested layouts, SSR, HMR
- 🎉 TailwindCSS v4 + shadcn (`components.json` configured, no components preinstalled — run `npx shadcn add <component>` as needed)

## Getting Started

### Development

```bash
npm install
npm run dev
```

Configure Entra ID app registration values and `SESSION_SECRET` in `.env` (see existing variables: `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT_ID`, `MICROSOFT_REDIRECT_URI`, `MAIL_SENDER`).

### Docker

```bash
docker compose up --build
```

This builds the app image, starts Postgres, runs `prisma migrate deploy`, and serves the app on `http://localhost:3010`.

## Building for Production

```bash
npm run build
```
```

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json docker-compose.yml .env README.md
git commit -m "Rename project to app-template, drop orphaned dependencies"
```

---

### Task 7: Full verification

**Files:** none (verification only)

**Interfaces:** none — this task only runs commands and inspects output.

- [ ] **Step 1: Typecheck**

```bash
npm run typecheck
```

Expected: exits 0, no errors.

- [ ] **Step 2: Build**

```bash
npm run build
```

Expected: exits 0, produces `build/client` and `build/server`.

- [ ] **Step 3: Bring up the full stack with Docker**

```bash
docker compose up --build -d
```

Expected: both `app-template-app` and `app-template-postgres` containers reach a running/healthy state. Check with:

```bash
docker compose ps
docker compose logs app --tail=50
```

Expected log output includes `▶ Aplicando migraciones de base de datos...`, the squashed `20260618000000_init` migration applying successfully, then `▶ Iniciando servidor...` with no crash.

- [ ] **Step 4: Smoke-check the running app**

```bash
curl -i http://localhost:3010/login
```

Expected: `HTTP/1.1 200` (or 304) and HTML containing "Iniciar sesión con Microsoft" — confirms routing, auth layout, and the dashboard's protected-redirect logic are all wired correctly (an unauthenticated request to `/` should redirect to `/login`):

```bash
curl -i http://localhost:3010/
```

Expected: `HTTP/1.1 302` with `Location: /login`.

- [ ] **Step 5: Tear down**

```bash
docker compose down
```

- [ ] **Step 6: Commit any incidental fixes found during verification**

If any step above failed and required a code fix, stage and commit that fix now with a message describing what was broken and why (e.g. "Fix missing import after dashboard rewrite"). If nothing needed fixing, skip this step — there is nothing to commit.

---

## Self-Review Notes

- **Spec coverage:** Every "Keep" bullet in the spec maps to an unmodified-or-simplified file (auth: untouched; email: Task 3; routing: Task 1; DB: Task 4; Docker: Task 6; dashboard: Task 5). Every "Remove" bullet maps to a delete step (job queue: Task 3; tiptap/business UI/hooks/dead lib files: Task 2; business routes: Task 1; orphaned deps: Task 6).
- **Type consistency:** `sendEmail` signature in Task 3 matches its only declared shape (no other task calls it yet, so no drift risk). `Dashboard` loader's `user` shape (`{ id, email, createdAt, updatedAt }` from Prisma) matches what Task 5's component destructures (`user.email`).
- **No placeholders:** every step has literal file contents or literal commands with expected output.
