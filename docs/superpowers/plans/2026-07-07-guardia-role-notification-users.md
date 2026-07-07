# Rol Guardia, destinatarios por usuario y fix de búsqueda Entra ID Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the four confirmed gaps in the shipment-window-scheduler app: unblock the Entra ID user search input, add a `GUARDIA` role for gate guards checking in units via QR, let admins pick notification recipients from existing system users instead of typing raw emails, and fix a cosmetic key bug in the delay-reason report table.

**Architecture:** Two additive Prisma migrations (new `Role` enum value; `NotificationRecipient.email` → `NotificationRecipient.userId` FK), small route/permission edits reusing the existing `requireUser(request, roles[])` guard pattern, one UI component rewrite (drop Radix `Popover` in favor of a plain absolutely-positioned div to stop it fighting the parent `Dialog` for focus), and one one-line JSX fix.

**Tech Stack:** React Router v7 (file-based routes under `app/routes`), Prisma 7 + Postgres (`prisma/schema.prisma`, hand-written migration SQL files, `@prisma/adapter-pg`), Radix UI primitives via the `radix-ui` package (`app/components/ui/*`), Vitest for unit tests.

## Global Constraints

- Migrations are hand-written SQL files under `prisma/migrations/<timestamp>_<name>/migration.sql`, following the exact style already in this repo (see `prisma/migrations/20260703120000_add_delay_reason_catalog/migration.sql` and `.../20260703123000_client_preferred_warehouse_fk/migration.sql`) — comments per statement, FK constraint names as `"{Table}_{column}_fkey"`.
- Apply migrations with `npx prisma migrate deploy` (non-interactive) followed by `npx prisma generate`, never `prisma migrate dev` (that command can prompt interactively, which this environment cannot answer).
- Spanish is the UI language throughout — all new labels must be Spanish, matching existing copy exactly in tone (see `ROLE_LABELS`, `WINDOW_TYPE_LABEL`, etc.).
- Follow existing patterns exactly: role lists live as `const X = [...] as const` + a `Record` label map (see `app/routes/admin/users.tsx:35-42`); admin CRUD dialogs use `CrudFormDialog` (`app/components/admin/CrudFormDialog.tsx`); every admin route loader starts with `await requireUser(request, ["ADMINISTRADOR"])`.
- Do not touch `app/components/ui/popover.tsx` or `app/components/ui/dialog.tsx` — the fix for Task 10 is local to `UserSearchCombobox.tsx` only.

---

### Task 1: Add `GUARDIA` to the `Role` enum

**Files:**
- Modify: `prisma/schema.prisma:9-14`
- Create: `prisma/migrations/20260707140000_add_guardia_role/migration.sql`

**Interfaces:**
- Produces: Prisma enum value `Role.GUARDIA` (string `"GUARDIA"`), consumed by Tasks 2, 3, 4, 5.

- [ ] **Step 1: Edit the `Role` enum in the schema**

In `prisma/schema.prisma`, change:

```prisma
enum Role {
  VENTAS
  CARGA
  DESCARGA
  ADMINISTRADOR
}
```

to:

```prisma
enum Role {
  VENTAS
  CARGA
  DESCARGA
  ADMINISTRADOR
  GUARDIA
}
```

- [ ] **Step 2: Write the migration**

Create `prisma/migrations/20260707140000_add_guardia_role/migration.sql`:

```sql
-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'GUARDIA';
```

- [ ] **Step 3: Apply the migration**

Run: `npx prisma migrate deploy`
Expected output includes: `Applying migration '20260707140000_add_guardia_role'` and ends with `All migrations have been successfully applied.`

- [ ] **Step 4: Regenerate the Prisma client**

Run: `npx prisma generate`
Expected: `Generated Prisma Client ... in XXXms` with no errors.

- [ ] **Step 5: Verify the enum value exists in Postgres**

Run: `docker compose exec postgres psql -U postgres -d app_template -c "SELECT enum_range(NULL::\"Role\");"`
Expected output contains `GUARDIA` in the listed range, e.g. `{VENTAS,CARGA,DESCARGA,ADMINISTRADOR,GUARDIA}`.

If the `postgres` service isn't running locally, start it first with `docker compose up -d postgres` and wait for `docker compose ps` to show it `healthy` before retrying.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260707140000_add_guardia_role
git commit -m "feat: add GUARDIA role for gate check-in accounts"
```

---

### Task 2: Allow creating `GUARDIA` users in `/admin/users`

**Files:**
- Modify: `app/routes/admin/users.tsx:35-42`

**Interfaces:**
- Consumes: `Role.GUARDIA` from Task 1.

- [ ] **Step 1: Add the role to the admin role list and labels**

In `app/routes/admin/users.tsx`, change:

```tsx
const ROLES = ["VENTAS", "CARGA", "DESCARGA", "ADMINISTRADOR"] as const;

const ROLE_LABELS: Record<string, string> = {
  VENTAS: "Ventas",
  CARGA: "Carga",
  DESCARGA: "Descarga",
  ADMINISTRADOR: "Administrador",
};
```

to:

```tsx
const ROLES = ["VENTAS", "CARGA", "DESCARGA", "ADMINISTRADOR", "GUARDIA"] as const;

const ROLE_LABELS: Record<string, string> = {
  VENTAS: "Ventas",
  CARGA: "Carga",
  DESCARGA: "Descarga",
  ADMINISTRADOR: "Administrador",
  GUARDIA: "Guardia",
};
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exits 0, no new errors.

- [ ] **Step 3: Commit**

```bash
git add app/routes/admin/users.tsx
git commit -m "feat: allow assigning the Guardia role from the users admin page"
```

---

### Task 3: Allow `GUARDIA` to access `/checkin/:id`

**Files:**
- Modify: `app/routes/checkin.tsx:15`

**Interfaces:**
- Consumes: `Role.GUARDIA` from Task 1.

- [ ] **Step 1: Add the role to the loader's allowed-roles list**

In `app/routes/checkin.tsx`, change:

```tsx
  await requireUser(request, ["CARGA", "DESCARGA", "ADMINISTRADOR"]);
```

to:

```tsx
  await requireUser(request, ["CARGA", "DESCARGA", "ADMINISTRADOR", "GUARDIA"]);
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add app/routes/checkin.tsx
git commit -m "feat: let Guardia accounts confirm arrivals from the QR check-in page"
```

---

### Task 4: Simple landing message for `GUARDIA` on `/`

**Files:**
- Modify: `app/routes/_root.tsx:165-212`

**Interfaces:**
- Consumes: `loaderData.role` (already returned as-is for any role not explicitly handled — no loader change needed, `GUARDIA` already falls through to `return { role: user.role };` at `_root.tsx:75`).

- [ ] **Step 1: Add a dedicated branch for `GUARDIA` before the generic fallback**

In `app/routes/_root.tsx`, insert a new block right after the `CARGA`/`DESCARGA` block (which ends at line 195) and before the generic fallback block (line 197-211):

```tsx
  if (loaderData.role === "GUARDIA") {
    return (
      <div className="flex min-h-[70vh] items-center justify-center p-4">
        <p className="max-w-sm text-center text-muted-foreground">
          Escanea el código QR de la unidad para registrar su llegada.
        </p>
      </div>
    );
  }

```

The existing generic fallback (`Bienvenido` + link to `/calendar`) stays unchanged below it and continues to serve `VENTAS`.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add app/routes/_root.tsx
git commit -m "feat: show a simple scan-to-check-in message for Guardia accounts"
```

---

### Task 5: Hide "Calendario" from the sidebar for `GUARDIA`

**Files:**
- Modify: `app/components/layout/AppSidebar.tsx:36-39,84-110`

**Interfaces:**
- Consumes: `Role.GUARDIA` from Task 1; `role` prop already passed into `AppSidebar` from `app/routes/dashboard.tsx:43`.

- [ ] **Step 1: Filter `operationItems` down to just "Inicio" for Guardia**

In `app/components/layout/AppSidebar.tsx`, change the render of the operation group (inside `export function AppSidebar`) from:

```tsx
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Operación</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {operationItems.map((item) => (
                <NavLinkItem key={item.to} item={item} pathname={pathname} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
```

to:

```tsx
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Operación</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {(role === "GUARDIA"
                ? operationItems.filter((item) => item.to === "/")
                : operationItems
              ).map((item) => (
                <NavLinkItem key={item.to} item={item} pathname={pathname} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add app/components/layout/AppSidebar.tsx
git commit -m "feat: hide Calendario from the sidebar for Guardia accounts"
```

---

### Task 6: Change `NotificationRecipient.email` to `NotificationRecipient.userId`

**Files:**
- Modify: `prisma/schema.prisma:16-24,143-151`
- Create: `prisma/migrations/20260707141000_notification_recipient_by_user/migration.sql`

**Interfaces:**
- Produces: `NotificationRecipient.userId: Int` (FK to `User.id`), `NotificationRecipient.user: User` relation — consumed by Tasks 7 and 8.

- [ ] **Step 1: Update the `User` model to add the back-relation**

In `prisma/schema.prisma`, change:

```prisma
model User {
  id        Int      @id @default(autoincrement())
  email     String   @unique
  name      String   @default("")
  role      Role     @default(VENTAS)
  active    Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

to:

```prisma
model User {
  id                     Int                      @id @default(autoincrement())
  email                  String                   @unique
  name                   String                   @default("")
  role                   Role                     @default(VENTAS)
  active                 Boolean                  @default(true)
  createdAt              DateTime                 @default(now())
  updatedAt              DateTime                 @updatedAt
  notificationRecipients NotificationRecipient[]
}
```

- [ ] **Step 2: Update the `NotificationRecipient` model**

Change:

```prisma
model NotificationRecipient {
  id        String            @id @default(cuid())
  event     NotificationEvent
  email     String
  active    Boolean           @default(true)
  createdAt DateTime          @default(now())

  @@unique([event, email])
}
```

to:

```prisma
model NotificationRecipient {
  id        String            @id @default(cuid())
  event     NotificationEvent
  userId    Int
  user      User              @relation(fields: [userId], references: [id])
  active    Boolean           @default(true)
  createdAt DateTime          @default(now())

  @@unique([event, userId])
}
```

- [ ] **Step 3: Write the migration**

Create `prisma/migrations/20260707141000_notification_recipient_by_user/migration.sql`. This is destructive for the `email` column — acceptable because no default recipients are seeded (`prisma/seed.ts` never inserts into `NotificationRecipient`), so any pre-existing rows only exist if an admin manually added them in a running environment; if `ADD COLUMN "userId" INTEGER NOT NULL` fails locally because rows already exist, run `docker compose exec postgres psql -U postgres -d app_template -c 'TRUNCATE "NotificationRecipient";'` first (safe: the table only holds admin-configured email routing, not business data) and re-run the migration.

```sql
-- DropIndex
DROP INDEX "NotificationRecipient_event_email_key";

-- AlterTable
ALTER TABLE "NotificationRecipient" DROP COLUMN "email",
ADD COLUMN "userId" INTEGER NOT NULL;

-- AddForeignKey
ALTER TABLE "NotificationRecipient" ADD CONSTRAINT "NotificationRecipient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex
CREATE UNIQUE INDEX "NotificationRecipient_event_userId_key" ON "NotificationRecipient"("event", "userId");
```

- [ ] **Step 4: Apply the migration**

Run: `npx prisma migrate deploy`
Expected: `Applying migration '20260707141000_notification_recipient_by_user'` then `All migrations have been successfully applied.`

If it fails with a not-null constraint violation, truncate the table as described in Step 3 and re-run.

- [ ] **Step 5: Regenerate the Prisma client**

Run: `npx prisma generate`
Expected: `Generated Prisma Client ... in XXXms` with no errors.

- [ ] **Step 6: Verify the column change**

Run: `docker compose exec postgres psql -U postgres -d app_template -c "\d \"NotificationRecipient\""`
Expected: column list shows `userId | integer` and no `email` column; a foreign-key constraint on `userId` referencing `User`.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260707141000_notification_recipient_by_user
git commit -m "feat: link notification recipients to system users instead of raw emails"
```

---

### Task 7: Update `getRecipientEmails` to resolve through `User`

**Files:**
- Modify: `app/lib/notificationRecipients.server.ts`

**Interfaces:**
- Consumes: `NotificationRecipient.userId`/`user` from Task 6.
- Produces: `getRecipientEmails(event: NotificationEvent): Promise<string[]>` — signature unchanged, still consumed by `app/lib/delayEscalation.server.ts` and `app/routes/api/windows.$id.arrive.ts` with no changes needed there.

Note on testing: `app/lib/notificationRecipients.test.ts` currently only covers the pure function `delayMinutesToEvent` — it does not test `getRecipientEmails`, and no test in this codebase mocks Prisma (`windowOverlap.test.ts`, `delayThresholds.test.ts`, and `reportIndicators.test.ts` all test pure functions with no DB access). Following that existing convention, `getRecipientEmails` stays untested by Vitest here; it's covered by the manual verification in Task 12 Step 5 instead. Do not add a Prisma-mocking test — it would be the first of its kind and inconsistent with how the rest of this codebase tests DB-touching functions.

- [ ] **Step 1: Update the implementation**

In `app/lib/notificationRecipients.server.ts`, change:

```ts
export async function getRecipientEmails(event: NotificationEvent): Promise<string[]> {
  const recipients = await prisma.notificationRecipient.findMany({
    where: { event, active: true },
  });
  return recipients.map((r) => r.email);
}
```

to:

```ts
export async function getRecipientEmails(event: NotificationEvent): Promise<string[]> {
  const recipients = await prisma.notificationRecipient.findMany({
    where: { event, active: true, user: { active: true } },
    include: { user: true },
  });
  return recipients.map((r) => r.user.email);
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exits 0 — this confirms `r.user.email` resolves against the regenerated Prisma types from Task 6.

- [ ] **Step 3: Commit**

```bash
git add app/lib/notificationRecipients.server.ts
git commit -m "feat: resolve notification recipient emails through the linked user"
```

---

### Task 8: Update the notification-recipients API for `userId`

**Files:**
- Modify: `app/routes/api/notification-recipients.ts`

**Interfaces:**
- Consumes: `NotificationRecipient.userId` from Task 6.
- Produces: `loader` returns recipients with an embedded `user: { id, name, email, active }` object (consumed by Task 9's table); `POST` action now expects JSON body `{ event, userId }` instead of `{ event, email }` (consumed by Task 9's create form).

- [ ] **Step 1: Update the loader and action**

In `app/routes/api/notification-recipients.ts`, change:

```ts
export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request, ["ADMINISTRADOR"]);
  const recipients = await prisma.notificationRecipient.findMany({
    orderBy: [{ event: "asc" }, { email: "asc" }],
  });
  return Response.json(recipients);
}

export async function action({ request }: Route.ActionArgs) {
  await requireUser(request, ["ADMINISTRADOR"]);
  const body = await request.json();

  if (request.method === "PATCH") {
    const recipient = await prisma.notificationRecipient.update({
      where: { id: body.id },
      data: { active: body.active ?? undefined },
    });
    return Response.json(recipient);
  }

  if (request.method === "DELETE") {
    await prisma.notificationRecipient.delete({ where: { id: body.id } });
    return Response.json({ ok: true });
  }

  const recipient = await prisma.notificationRecipient.create({
    data: { event: body.event, email: body.email },
  });
  return Response.json(recipient, { status: 201 });
}
```

to:

```ts
export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request, ["ADMINISTRADOR"]);
  const recipients = await prisma.notificationRecipient.findMany({
    orderBy: [{ event: "asc" }, { user: { name: "asc" } }],
    include: { user: { select: { id: true, name: true, email: true, active: true } } },
  });
  return Response.json(recipients);
}

export async function action({ request }: Route.ActionArgs) {
  await requireUser(request, ["ADMINISTRADOR"]);
  const body = await request.json();

  if (request.method === "PATCH") {
    const recipient = await prisma.notificationRecipient.update({
      where: { id: body.id },
      data: { active: body.active ?? undefined },
    });
    return Response.json(recipient);
  }

  if (request.method === "DELETE") {
    await prisma.notificationRecipient.delete({ where: { id: body.id } });
    return Response.json({ ok: true });
  }

  const recipient = await prisma.notificationRecipient.create({
    data: { event: body.event, userId: Number(body.userId) },
  });
  return Response.json(recipient, { status: 201 });
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add app/routes/api/notification-recipients.ts
git commit -m "feat: accept userId in the notification-recipients API"
```

---

### Task 9: Update `/admin/notifications` UI to pick a system user

**Files:**
- Modify: `app/routes/admin/notifications.tsx`

**Interfaces:**
- Consumes: `Route.LoaderArgs` data shape `{ recipients: (NotificationRecipient & { user: { id, name, email, active } })[] }` from Task 8; needs an additional `users: { id, name, email }[]` list added to this same loader.

- [ ] **Step 1: Load active users alongside recipients**

In `app/routes/admin/notifications.tsx`, change the loader:

```tsx
export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request, ["ADMINISTRADOR"]);
  const recipients = await prisma.notificationRecipient.findMany({
    orderBy: [{ event: "asc" }, { email: "asc" }],
  });
  return { recipients };
}
```

to:

```tsx
export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request, ["ADMINISTRADOR"]);
  const [recipients, users] = await Promise.all([
    prisma.notificationRecipient.findMany({
      orderBy: [{ event: "asc" }, { user: { name: "asc" } }],
      include: { user: { select: { id: true, name: true, email: true, active: true } } },
    }),
    prisma.user.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true },
    }),
  ]);
  return { recipients, users };
}
```

- [ ] **Step 2: Replace the `email` state with `userId` and update the component signature**

Change:

```tsx
export default function NotificationsAdmin({ loaderData }: Route.ComponentProps) {
  const { recipients } = loaderData;
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const [event, setEvent] = useState<string>(NOTIFICATION_EVENTS[0]);
  const [email, setEmail] = useState("");

  async function handleCreate() {
    const res = await fetch("/api/notification-recipients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, email }),
    });
    if (!res.ok) { toast.error("No se pudo agregar el destinatario"); return; }
    toast.success("Destinatario agregado");
    setCreateOpen(false);
    setEmail("");
    navigate(".", { replace: true });
  }
```

to:

```tsx
export default function NotificationsAdmin({ loaderData }: Route.ComponentProps) {
  const { recipients, users } = loaderData;
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const [event, setEvent] = useState<string>(NOTIFICATION_EVENTS[0]);
  const [userId, setUserId] = useState("");

  async function handleCreate() {
    const res = await fetch("/api/notification-recipients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, userId }),
    });
    if (!res.ok) { toast.error("No se pudo agregar el destinatario"); return; }
    toast.success("Destinatario agregado");
    setCreateOpen(false);
    setUserId("");
    navigate(".", { replace: true });
  }
```

- [ ] **Step 3: Replace the email `Input` with a user `Select` in the create dialog**

Change:

```tsx
          <CrudFormDialog
            trigger={<Button>Nuevo destinatario</Button>}
            title="Nuevo destinatario"
            open={createOpen}
            onOpenChange={setCreateOpen}
            onSave={handleCreate}
            saveDisabled={!email}
          >
            <div className="space-y-1">
              <Label>Evento</Label>
              <Select value={event} onValueChange={setEvent}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NOTIFICATION_EVENTS.map((e) => (
                    <SelectItem key={e} value={e}>{NOTIFICATION_EVENT_LABEL[e]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="email">Correo</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </CrudFormDialog>
```

to:

```tsx
          <CrudFormDialog
            trigger={<Button>Nuevo destinatario</Button>}
            title="Nuevo destinatario"
            open={createOpen}
            onOpenChange={setCreateOpen}
            onSave={handleCreate}
            saveDisabled={!userId}
          >
            <div className="space-y-1">
              <Label>Evento</Label>
              <Select value={event} onValueChange={setEvent}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NOTIFICATION_EVENTS.map((e) => (
                    <SelectItem key={e} value={e}>{NOTIFICATION_EVENT_LABEL[e]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Usuario</Label>
              <Select value={userId} onValueChange={setUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un usuario" />
                </SelectTrigger>
                <SelectContent>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={String(u.id)}>{u.name} — {u.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CrudFormDialog>
```

`Input` is now unused in this file (it was only used for the removed email field) — remove its import line:

```tsx
import { Input } from "~/components/ui/input";
```

- [ ] **Step 4: Update the recipients table to show the linked user**

Change:

```tsx
              {recipients.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="pl-4 font-medium">{NOTIFICATION_EVENT_LABEL[r.event]}</TableCell>
                  <TableCell className="text-muted-foreground">{r.email}</TableCell>
```

to:

```tsx
              {recipients.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="pl-4 font-medium">{NOTIFICATION_EVENT_LABEL[r.event]}</TableCell>
                  <TableCell className="text-muted-foreground">{r.user.name} — {r.user.email}</TableCell>
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add app/routes/admin/notifications.tsx
git commit -m "feat: pick notification recipients from the system users list"
```

---

### Task 10: Fix the blocked Entra ID search input

**Files:**
- Modify: `app/components/admin/UserSearchCombobox.tsx`

**Interfaces:**
- Produces: same public interface, `UserSearchCombobox({ onSelect: (user: { name: string; email: string }) => void })` — no callers change (`app/routes/admin/users.tsx:130-132` stays as-is).

- [ ] **Step 1: Rewrite the component without Radix `Popover`**

Replace the full contents of `app/components/admin/UserSearchCombobox.tsx`:

```tsx
import { useEffect, useRef, useState } from "react";
import { Input } from "~/components/ui/input";

interface DirectoryUser {
  name: string;
  email: string;
}

export function UserSearchCombobox({
  onSelect,
}: {
  onSelect: (user: DirectoryUser) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DirectoryUser[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        setResults(data.results ?? []);
        setUnavailable(data.error === "graph_unavailable");
        setOpen(true);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <Input
        placeholder="Buscar por nombre o correo en el directorio..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
      />
      {open && (
        <div className="absolute z-50 mt-1 w-80 max-w-full rounded-lg bg-popover p-1 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10">
          {loading && <p className="px-2 py-1.5 text-sm text-muted-foreground">Buscando...</p>}
          {!loading && unavailable && (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">
              No se pudo consultar el directorio. Ingresa los datos manualmente.
            </p>
          )}
          {!loading && !unavailable && results.length === 0 && (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">Sin resultados.</p>
          )}
          {!loading &&
            results.map((u) => (
              <button
                key={u.email}
                type="button"
                className="block w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
                onClick={() => {
                  onSelect(u);
                  setOpen(false);
                }}
              >
                <span className="font-medium">{u.name}</span>
                <span className="block text-xs text-muted-foreground">{u.email}</span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
```

This drops `Popover`/`PopoverContent`/`PopoverTrigger` entirely — the results panel is now a normal `absolute`-positioned sibling `<div>` inside the same DOM subtree as the `Input`, so it never creates a competing `FocusScope`/portal against the parent `Dialog`. Click-outside-to-close is now handled manually via a `mousedown` listener since Radix no longer provides it.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 3: Manual verification**

Run: `npm run dev`, open `/admin/users`, click "Nuevo usuario", leave "Buscar en el directorio" selected, click into the search input, and type at least 2 characters continuously.
Expected: every keystroke lands in the input (the value keeps growing character by character) and, once results come back (or the "No se pudo consultar el directorio" message appears), typing further still works without the input losing focus.

- [ ] **Step 4: Commit**

```bash
git add app/components/admin/UserSearchCombobox.tsx
git commit -m "fix: stop the Entra ID search input from losing focus inside the user dialog"
```

---

### Task 11: Fix the "Retrasos por motivo" table key

**Files:**
- Modify: `app/routes/reports.tsx:221`

**Interfaces:**
- Consumes: `computeRetrasos()` return shape `{ porMotivo: { id: string; label: string; count: number }[] }` from `app/lib/reportIndicators.ts:102` (unchanged, just correctly referenced now).

- [ ] **Step 1: Fix the key**

In `app/routes/reports.tsx`, change:

```tsx
                    {summary.retrasos.porMotivo.map((row: any) => (
                      <TableRow key={row.category}>
```

to:

```tsx
                    {summary.retrasos.porMotivo.map((row: any) => (
                      <TableRow key={row.id}>
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add app/routes/reports.tsx
git commit -m "fix: use the correct row id as the React key in the delay-reason report table"
```

---

### Task 12: Full manual verification pass

**Files:** none (verification only).

**Interfaces:** none.

- [ ] **Step 1: Start the stack**

Run: `docker compose up -d postgres` then `npm run dev`. Confirm the dev server prints a local URL (typically `http://localhost:5173`).

- [ ] **Step 2: Verify the "Tipo de operación" select is visible**

Log in as the seeded admin (`admin@example.com`, per `prisma/seed.ts:70-74` — via whatever local auth bypass or Entra sandbox tenant is configured for dev), go to `/calendar`, click "Nueva ventana", and confirm the "Tipo de operación" `Select` (Carga/Descarga) renders between "Nave" and "Fecha"/"Hora de llegada". This confirms the field the user thought was missing is present in this build; if it's missing in the Portainer-deployed instance, that instance needs a rebuild/redeploy from this branch.

- [ ] **Step 3: Verify the Entra ID search fix**

Go to `/admin/users`, open "Nuevo usuario", type into "Buscar en el directorio" and confirm typing is never blocked (per Task 10 Step 3).

- [ ] **Step 4: Verify Guardia role assignment and check-in access**

Create a user with role "Guardia" in `/admin/users`. Confirm the role saves and shows as "Guardia" in the table. (Logging in as that account requires a real Entra ID account mapped to that email — if no such test account is available, verify instead by reading `app/routes/checkin.tsx:15` to confirm `"GUARDIA"` is present in the `requireUser` allow-list, and `app/routes/_root.tsx`/`AppSidebar.tsx` to confirm the Guardia-specific branches from Tasks 4-5 are in place.)

- [ ] **Step 5: Verify notification recipients by user**

Go to `/admin/notifications`, click "Nuevo destinatario", confirm the dialog shows a "Usuario" `Select` populated with existing active users (not a free-text email field), pick one for the "Llegada a planta" event, save, and confirm the table row shows "{nombre} — {correo}".

- [ ] **Step 6: Verify the reports table renders without duplicate-key warnings**

Go to `/reports`, open the browser devtools console, and confirm there is no "Encountered two children with the same key" warning for the "Retrasos por motivo" table (create at least two windows with different delay reasons via `/windows/:id` complete-flow if the table is empty, to have more than one row to check).

- [ ] **Step 7: Run the full test suite**

Run: `npm run test`
Expected: all existing tests pass (no regressions from the `notificationRecipients.server.ts` or `reports.tsx` changes).
