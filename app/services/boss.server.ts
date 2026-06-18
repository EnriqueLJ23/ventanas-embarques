import { PgBoss } from "pg-boss";

declare global {
  // eslint-disable-next-line no-var
  var __boss: InstanceType<typeof PgBoss> | undefined;
  // eslint-disable-next-line no-var
  var __bossStarted: boolean | undefined;
}

const boss: InstanceType<typeof PgBoss> =
  global.__boss ??
  new PgBoss({
    connectionString: process.env.DATABASE_URL!,
    application_name: "scheduler",
  });

if (!global.__boss) global.__boss = boss;

export { boss };

export async function startBoss() {
  if (global.__bossStarted) return;
  await boss.start();
  // Queue must exist before work() is called in pg-boss v10
  await boss.createQueue("send-reminder");
  global.__bossStarted = true;

  // Dynamic import breaks circular dependency with worker.server
  const { processReminder } = await import("./worker.server");
  await boss.work("send-reminder", { batchSize: 5 }, processReminder);
}

export async function scheduleReminderJob(
  reminderId: number,
  scheduledAt: Date
): Promise<string | null> {
  return boss.send("send-reminder", { reminderId }, { startAfter: scheduledAt });
}

export async function cancelReminderJob(jobId: string) {
  try {
    await boss.cancel("send-reminder", jobId);
  } catch {
    // ignore — job may already be completed or cancelled
  }
}
