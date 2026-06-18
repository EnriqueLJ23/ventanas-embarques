# Email Scheduler — Implementation Guide

> **Short answer: Yes, it is fully possible.**  
> You already have 60% of what you need. This document covers exactly what to add.

---

## 1. What You Already Have

| Piece | Status |
|---|---|
| Entra ID app registration | ✅ Done |
| `@azure/msal-node` installed | ✅ Done |
| `client_id`, `client_secret`, `tenant_id` in env | ✅ Done |
| PostgreSQL + Prisma | ✅ Done |
| OAuth login flow (user auth) | ✅ Done |
| React Router v7 long-running Node process | ✅ Done |
| `Mail.Send` Graph API permission | ❌ Needs adding |
| Job scheduler | ❌ Needs adding |
| `Reminder` database model | ❌ Needs adding |

---

## 2. Azure Portal — What to Configure

### 2.1 Add Mail.Send permission to your existing app

1. Go to [portal.azure.com](https://portal.azure.com)
2. **Entra ID → App registrations → your app**
3. **API permissions → Add a permission → Microsoft Graph**
4. Choose **Application permissions** (not Delegated — your scheduler runs without a user present)
5. Search and add:
   - `Mail.Send` — send emails from any mailbox in your org
   - `User.ReadBasic.All` — search employees for the recipient autocomplete
6. Click **Grant admin consent for [your org]** (requires Global Admin or Privileged Role Admin)

> **Why Application permissions?**  
> Delegated permissions require a logged-in user session at send time. Since your reminders send on a schedule — often hours or days later — there is no active session. Application permissions let your server act as a trusted service.

### 2.2 Decide which mailbox sends the emails

With `Mail.Send` (Application), your app can send FROM any mailbox in the tenant using:
```
POST /v1.0/users/{senderEmail}/sendMail
```

Two common approaches:

| Approach | How it looks to recipient | Best for |
|---|---|---|
| **Service account** — create `reminders@yourcompany.com` | From: Reminder Scheduler <reminders@yourcompany.com> | Most enterprise-friendly, simple |
| **Send as the logged-in user** — use their UPN | From: Jesus Luna <jesus@yourcompany.com> | More personal, requires storing their email |

**Recommended:** create a shared mailbox `reminders@yourcompany.com` in Exchange Online. It does not need a license. Use that as the sender in all Graph calls.

### 2.3 Keep your existing login scope

Your login flow uses delegated `User.Read` (or similar) to authenticate the user. That is separate from the sending flow and does not need to change.

---

## 3. Sending Emails via Microsoft Graph

### 3.1 Get a token with client credentials (no user needed)

Your existing `msalClient` already supports this. Add this helper to `app/lib/microsoft.server.ts`:

```ts
export async function getAppAccessToken(): Promise<string> {
  const result = await msalClient.acquireTokenByClientCredential({
    scopes: ["https://graph.microsoft.com/.default"],
  });
  if (!result?.accessToken) throw new Error("Failed to acquire Graph token");
  return result.accessToken;
}
```

`/.default` means "use all Application permissions granted in the portal."

### 3.2 Send a mail via Graph

```ts
// app/lib/graph-mail.server.ts

import { getAppAccessToken } from "~/lib/microsoft.server";

const SENDER = process.env.MAIL_SENDER!; // e.g. reminders@yourcompany.com

export async function sendReminderEmail(reminder: {
  toAddresses: string[];
  ccAddresses: string[];
  subject: string;
  body: string; // HTML
}) {
  const token = await getAppAccessToken();

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${SENDER}/sendMail`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          subject: reminder.subject,
          body: { contentType: "HTML", content: reminder.body },
          toRecipients: reminder.toAddresses.map((a) => ({
            emailAddress: { address: a },
          })),
          ccRecipients: reminder.ccAddresses.map((a) => ({
            emailAddress: { address: a },
          })),
        },
        saveToSentItems: true,
      }),
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Graph sendMail failed: ${res.status} — ${JSON.stringify(err)}`);
  }
}
```

### 3.3 Search employees for the recipient autocomplete

Replace the mock contacts with a real Graph search:

```ts
// app/lib/graph-users.server.ts

import { getAppAccessToken } from "~/lib/microsoft.server";

export async function searchUsers(query: string) {
  if (!query || query.length < 2) return [];

  const token = await getAppAccessToken();

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users?$search="displayName:${encodeURIComponent(query)}" OR "mail:${encodeURIComponent(query)}"&$select=displayName,mail,userPrincipalName&$top=8`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        ConsistencyLevel: "eventual", // required for $search
      },
    }
  );

  if (!res.ok) return [];

  const data = await res.json();
  return (data.value as any[])
    .filter((u) => u.mail)
    .map((u) => ({ name: u.displayName, email: u.mail }));
}
```

Wire this into a React Router `loader` on the composer route so the autocomplete fetches real Entra ID users.

---

## 4. Database Schema — Reminder Model

Replace the placeholder `Task` model in `prisma/schema.prisma`:

```prisma
model User {
  id        Int        @id @default(autoincrement())
  email     String     @unique
  createdAt DateTime   @default(now())
  updatedAt DateTime   @updatedAt
  reminders Reminder[]
}

model Reminder {
  id        Int      @id @default(autoincrement())
  userId    Int
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  // Recipients
  toAddresses String[]
  ccAddresses String[]  @default([])

  // Content
  subject  String
  body     String   // stored as HTML (from contenteditable)

  // Schedule
  scheduledAt  DateTime
  repeat       String   @default("never")  // never|daily|weekly|monthly|custom
  repeatConfig Json?    // { interval: 2, unit: "weeks", endType: "after", endCount: 10 }

  // Conditional rules — array of ConditionalRule objects
  rules Json? // [{ triggerType, dayOfWeek, actionType, actionValue, ... }]

  // Attachments — metadata only (actual files need separate file storage)
  attachments Json?  // [{ name, size, type, storageKey }]

  // Job tracking
  status    String    @default("PENDING")  // PENDING | SENT | FAILED | CANCELLED
  jobId     String?   // pg-boss job ID, for cancellation
  sentAt    DateTime?
  errorMsg  String?
  attempts  Int       @default(0)

  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt

  @@index([status, scheduledAt])
  @@index([userId])
}
```

Run `npx prisma migrate dev --name add-reminder-model` after updating the schema.

---

## 5. Job Scheduling — pg-boss (Recommended)

### Why pg-boss over alternatives

| Option | Pros | Cons |
|---|---|---|
| **pg-boss** (recommended) | Uses your existing Postgres, survives restarts, supports delayed jobs, retries | Slightly more setup than cron |
| `node-cron` | Simple | Jobs lost on restart, no persistence, no retries |
| BullMQ + Redis | Very powerful | Requires Redis (extra service/cost) |
| Azure Functions Timer | Fits Azure ecosystem | Separate deploy, more complexity |
| Vercel/Railway Cron | Zero-ops | Minute-level precision only, no fine scheduling |

**pg-boss** stores scheduled jobs in a `pgboss` schema in your existing Postgres database. When your server restarts, jobs are not lost. You can schedule a job to fire at exactly `2026-05-29T14:30:00Z` and pg-boss will execute it.

### Install

```bash
npm install pg-boss
```

### 5.1 Boss singleton

```ts
// app/lib/boss.server.ts

import PgBoss from "pg-boss";

declare global {
  var __boss: PgBoss | undefined;
}

function createBoss() {
  return new PgBoss({
    connectionString: process.env.DATABASE_URL!,
    // Keep completed jobs for 3 days for auditing
    deleteAfterHours: 72,
    retryLimit: 3,
    retryDelay: 60, // seconds between retries
    retryBackoff: true,
  });
}

// Singleton — avoids creating multiple boss instances during dev hot-reload
export const boss: PgBoss = globalThis.__boss ?? createBoss();
if (process.env.NODE_ENV !== "production") globalThis.__boss = boss;

export const REMINDER_JOB = "send-reminder";
```

### 5.2 Worker — processes due jobs

Create a separate file that runs alongside the web server:

```ts
// worker/index.ts

import PgBoss from "pg-boss";
import { prisma } from "../app/lib/db.server.js";
import { sendReminderEmail } from "../app/lib/graph-mail.server.js";
import { boss, REMINDER_JOB } from "../app/lib/boss.server.js";

async function processReminder(job: PgBoss.Job<{ reminderId: number }>) {
  const { reminderId } = job.data;

  const reminder = await prisma.reminder.findUnique({
    where: { id: reminderId },
  });

  if (!reminder || reminder.status === "CANCELLED") {
    return; // silently skip cancelled jobs
  }

  await prisma.reminder.update({
    where: { id: reminderId },
    data: { attempts: { increment: 1 } },
  });

  try {
    await sendReminderEmail({
      toAddresses: reminder.toAddresses,
      ccAddresses: reminder.ccAddresses,
      subject: reminder.subject,
      body: reminder.body,
    });

    await prisma.reminder.update({
      where: { id: reminderId },
      data: { status: "SENT", sentAt: new Date() },
    });

    // If this reminder repeats, schedule the next occurrence
    if (reminder.repeat !== "never") {
      await scheduleNextOccurrence(reminder);
    }
  } catch (err: any) {
    await prisma.reminder.update({
      where: { id: reminderId },
      data: { errorMsg: err.message },
    });
    throw err; // pg-boss will retry
  }
}

async function scheduleNextOccurrence(reminder: any) {
  const next = new Date(reminder.scheduledAt);

  switch (reminder.repeat) {
    case "daily":   next.setDate(next.getDate() + 1); break;
    case "weekly":  next.setDate(next.getDate() + 7); break;
    case "monthly": next.setMonth(next.getMonth() + 1); break;
    case "custom": {
      const cfg = reminder.repeatConfig as any;
      if (cfg?.unit === "days")   next.setDate(next.getDate() + cfg.interval);
      if (cfg?.unit === "weeks")  next.setDate(next.getDate() + cfg.interval * 7);
      if (cfg?.unit === "months") next.setMonth(next.getMonth() + cfg.interval);
      break;
    }
  }

  // Create a new Reminder row for the next send
  const nextReminder = await prisma.reminder.create({
    data: {
      ...reminder,
      id: undefined,
      scheduledAt: next,
      status: "PENDING",
      jobId: null,
      sentAt: null,
      errorMsg: null,
      attempts: 0,
      createdAt: undefined,
      updatedAt: undefined,
    },
  });

  const jobId = await boss.sendAfter(
    REMINDER_JOB,
    { reminderId: nextReminder.id },
    {},
    next
  );

  await prisma.reminder.update({
    where: { id: nextReminder.id },
    data: { jobId: String(jobId) },
  });
}

async function main() {
  await boss.start();
  console.log("Worker started — waiting for jobs");

  await boss.work(REMINDER_JOB, { teamSize: 5, teamConcurrency: 2 }, processReminder);
}

main().catch((err) => {
  console.error("Worker fatal error:", err);
  process.exit(1);
});
```

### 5.3 Schedule a job when a reminder is created

In your React Router action (when user clicks "Schedule"):

```ts
// app/routes/new-reminder.tsx — action

import { boss, REMINDER_JOB } from "~/lib/boss.server";

export async function action({ request }: Route.ActionArgs) {
  const userId = await requireUserId(request);
  const formData = await request.formData();

  const scheduledAt = new Date(
    `${formData.get("scheduleDate")}T${formData.get("scheduleTime")}:00`
  );

  const reminder = await prisma.reminder.create({
    data: {
      userId,
      toAddresses: JSON.parse(formData.get("to") as string),
      ccAddresses: JSON.parse(formData.get("cc") as string),
      subject: formData.get("subject") as string,
      body: formData.get("body") as string,
      scheduledAt,
      repeat: formData.get("repeat") as string,
      repeatConfig: formData.get("repeatConfig")
        ? JSON.parse(formData.get("repeatConfig") as string)
        : null,
      rules: formData.get("rules")
        ? JSON.parse(formData.get("rules") as string)
        : null,
      status: "PENDING",
    },
  });

  // Schedule the job to fire at scheduledAt
  const jobId = await boss.sendAfter(
    REMINDER_JOB,
    { reminderId: reminder.id },
    {},
    scheduledAt
  );

  await prisma.reminder.update({
    where: { id: reminder.id },
    data: { jobId: String(jobId) },
  });

  return redirect("/upcoming");
}
```

### 5.4 Cancel a scheduled reminder

```ts
if (reminder.jobId) {
  await boss.cancel(reminder.jobId);
}
await prisma.reminder.update({
  where: { id: reminder.id },
  data: { status: "CANCELLED" },
});
```

---

## 6. Running the Worker

### Development

Run two terminal tabs:

```bash
# Tab 1 — web server
npm run dev

# Tab 2 — worker
npx tsx watch worker/index.ts
```

### Production

The worker is a separate Node process. How you run it depends on your host:

**Option A — Two processes on the same host (Railway, Render, VPS):**

Add to `package.json`:
```json
"scripts": {
  "start": "react-router-serve ./build/server/index.js",
  "worker": "node worker/index.js"
}
```

Use a `Procfile` or your host's "background worker" feature:
```
web: npm run start
worker: npm run worker
```

**Option B — Azure Container Apps:**  
Deploy two containers from the same image — one runs `npm start`, one runs `npm run worker`. They share the same Postgres database. This is the most enterprise-appropriate deployment if you're already in Azure.

**Option C — Azure Functions Timer Trigger:**  
Instead of pg-boss, a timer function checks the DB every minute for due reminders and sends them. Simpler but limited to ~1 minute precision.

---

## 7. File Attachments

The current design stores attachment metadata only. For real attachments:

1. **Azure Blob Storage** (recommended given your Microsoft stack):
   - Package: `@azure/storage-blob`
   - Upload on form submit → get back a `storageKey` (blob name)
   - Store key in reminder's `attachments` JSON field
   - In the worker: download the blob, attach to the Graph API call as base64

2. **Graph API with attachments:**

```ts
const attachments = await Promise.all(
  reminder.attachments.map(async (a) => {
    const content = await downloadFromBlob(a.storageKey); // base64 string
    return {
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: a.name,
      contentType: "application/octet-stream",
      contentBytes: content,
    };
  })
);

// Add to the message object:
message.attachments = attachments;
```

For now (prototype), you can skip file storage and implement it when ready.

---

## 8. Environment Variables Checklist

```env
# Already have these:
MICROSOFT_CLIENT_ID=your-app-client-id
MICROSOFT_CLIENT_SECRET=your-app-client-secret
MICROSOFT_TENANT_ID=your-tenant-id
MICROSOFT_REDIRECT_URI=http://localhost:5173/auth/callback

# Add these:
DATABASE_URL=postgresql://user:pass@host:5432/scheduler

# The mailbox emails will be sent FROM:
MAIL_SENDER=reminders@yourcompany.com

# Optional — for Azure Blob attachment storage:
AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=https;...
AZURE_STORAGE_CONTAINER=reminder-attachments
```

---

## 9. Implementation Order (Step by Step)

Do these in order — each step is independently testable.

1. **[ ] Azure portal**: Add `Mail.Send` + `User.ReadBasic.All` application permissions → grant admin consent
2. **[ ] Create `reminders@yourcompany.com`** shared mailbox in Exchange Online (no license needed)
3. **[ ] Test token + send** — write a one-off script that calls `getAppAccessToken()` and sends yourself a test email via Graph. Verify it works before building anything else.
4. **[ ] Prisma migration** — add the `Reminder` model, run `prisma migrate dev`
5. **[ ] Install pg-boss** — `npm install pg-boss`, create `boss.server.ts`
6. **[ ] Build worker** — `worker/index.ts` that processes `send-reminder` jobs
7. **[ ] Wire the form** — submit action creates `Reminder` row + schedules pg-boss job
8. **[ ] Replace mock contacts** — loader on composer route calls `searchUsers()` from Graph
9. **[ ] Conditional rule engine** — before sending, evaluate rules and mutate body/subject/cc
10. **[ ] Repeat scheduling** — worker creates the next `Reminder` row after a successful send
11. **[ ] Cancel/edit flow** — cancels the pg-boss job and updates status
12. **[ ] File attachments** — Azure Blob upload + Graph attachment (can be done last)

---

## 10. Applying Conditional Rules Before Sending

The rules need to be evaluated at send time (in the worker), not stored as pre-computed content:

```ts
// app/lib/apply-rules.ts

import type { ConditionalRule } from "~/lib/mock-reminders";

export function applyConditionalRules(
  reminder: { body: string; subject: string; ccAddresses: string[]; scheduledAt: Date; toAddresses: string[]; attempts: number },
  rules: ConditionalRule[]
): { body: string; subject: string; ccAddresses: string[] } {
  let { body, subject, ccAddresses } = reminder;
  const dayOfWeek = reminder.scheduledAt.toLocaleDateString("en-US", { weekday: "long" }).toLowerCase();
  const hour = reminder.scheduledAt.getHours();

  for (const rule of rules) {
    const matches = (() => {
      switch (rule.triggerType) {
        case "day_of_week":
          if (rule.dayOfWeek === "weekend") return dayOfWeek === "saturday" || dayOfWeek === "sunday";
          if (rule.dayOfWeek === "weekday") return !["saturday","sunday"].includes(dayOfWeek);
          return dayOfWeek === rule.dayOfWeek;
        case "nth_occurrence":
          return reminder.attempts + 1 === rule.nthOccurrence;
        case "recipient_domain":
          return reminder.toAddresses.some((a) => a.endsWith(rule.recipientDomain ?? ""));
        case "time_of_day":
          const ruleHour = parseInt(rule.timeValue?.split(":")[0] ?? "9");
          return rule.timeComparison === "before" ? hour < ruleHour : hour >= ruleHour;
        default: return false;
      }
    })();

    if (!matches) continue;

    switch (rule.actionType) {
      case "prepend_body":   body = rule.actionValue + body; break;
      case "append_body":    body = body + rule.actionValue; break;
      case "replace_body":   body = rule.actionValue; break;
      case "modify_subject":
        if (rule.subjectAction === "prepend")  subject = rule.actionValue + subject;
        if (rule.subjectAction === "append")   subject = subject + rule.actionValue;
        if (rule.subjectAction === "replace")  subject = rule.actionValue;
        break;
      case "add_cc":
        if (rule.actionValue && !ccAddresses.includes(rule.actionValue))
          ccAddresses = [...ccAddresses, rule.actionValue];
        break;
    }
  }

  return { body, subject, ccAddresses };
}
```

Call this in the worker before `sendReminderEmail()`.

---

## 11. Key Limitations to Know

| Limitation | Detail |
|---|---|
| **Mail.Send scope** | Lets you send as ANY user. Guard this well — only your service should have the client secret. |
| **Graph rate limits** | 10,000 requests per 10 minutes per mailbox. Fine for a company scheduler. |
| **Exchange throttling** | Sending >5,000 messages/day from one mailbox can trigger limits. The shared mailbox helps. |
| **pg-boss precision** | Jobs fire within ~5–10 seconds of their target time. Fine for reminders, not for millisecond-precise systems. |
| **Attachments in Graph** | The entire attachment must be base64-encoded inline for files < 3 MB. For larger files use the Graph upload session API. |
| **Admin consent** | You need a Global Admin or Privileged Role Admin to grant the Mail.Send application permission. If you're not one, you'll need to request it from IT. |
