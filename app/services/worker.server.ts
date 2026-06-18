import type { Job, PgBoss as PgBossType } from "pg-boss";

declare global {
  // eslint-disable-next-line no-var
  var __boss: InstanceType<typeof PgBossType> | undefined;
}

import { prisma } from "~/lib/db.server";
import { sendReminderEmail } from "./email.server";
import type { ConditionalRule, RepeatConfig } from "~/lib/types";

const DAY_MAP: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

function applyRules(
  bodyHtml: string,
  subject: string,
  ccAddresses: string[],
  toAddresses: string[],
  rules: ConditionalRule[],
  scheduledAt: Date,
  sendCount: number
): { body: string; subject: string; cc: string[] } {
  let body = bodyHtml;
  let subj = subject;
  const cc = [...ccAddresses];

  const dayOfWeek = scheduledAt.getDay();
  const h = scheduledAt.getHours().toString().padStart(2, "0");
  const m = scheduledAt.getMinutes().toString().padStart(2, "0");
  const timeStr = `${h}:${m}`;

  for (const rule of rules) {
    let triggered = false;

    switch (rule.triggerType) {
      case "day_of_week": {
        const dow = rule.dayOfWeek ?? "monday";
        if (dow === "weekend") triggered = dayOfWeek === 0 || dayOfWeek === 6;
        else if (dow === "weekday") triggered = dayOfWeek >= 1 && dayOfWeek <= 5;
        else triggered = dayOfWeek === (DAY_MAP[dow] ?? -1);
        break;
      }
      case "nth_occurrence":
        triggered = sendCount + 1 === (rule.nthOccurrence ?? 1);
        break;
      case "recipient_domain":
        triggered = toAddresses.some((a) =>
          a.toLowerCase().endsWith((rule.recipientDomain ?? "").toLowerCase())
        );
        break;
      case "time_of_day":
        triggered =
          rule.timeComparison === "before"
            ? timeStr < (rule.timeValue ?? "09:00")
            : timeStr > (rule.timeValue ?? "09:00");
        break;
    }

    if (!triggered) continue;

    switch (rule.actionType) {
      case "prepend_body":
        body = rule.actionValue + body;
        break;
      case "append_body":
        body = body + rule.actionValue;
        break;
      case "replace_body":
        body = rule.actionValue;
        break;
      case "modify_subject": {
        const sa = rule.subjectAction ?? "prepend";
        if (sa === "prepend") subj = rule.actionValue + subj;
        else if (sa === "append") subj = subj + rule.actionValue;
        else subj = rule.actionValue;
        break;
      }
      case "add_cc":
        if (rule.actionValue && !cc.includes(rule.actionValue)) {
          cc.push(rule.actionValue);
        }
        break;
    }
  }

  return { body, subject: subj, cc };
}

function nextScheduledAt(
  from: Date,
  repeat: string,
  repeatConfig: RepeatConfig | null,
  sendCount: number
): Date | null {
  if (repeat === "never") return null;

  const d = new Date(from);

  if (repeat === "daily") {
    d.setDate(d.getDate() + 1);
  } else if (repeat === "weekly") {
    d.setDate(d.getDate() + 7);
  } else if (repeat === "monthly") {
    d.setMonth(d.getMonth() + 1);
  } else if (repeat === "custom" && repeatConfig) {
    const { interval, unit, endType, endCount, endDate } = repeatConfig;
    if (unit === "days") d.setDate(d.getDate() + interval);
    else if (unit === "weeks") d.setDate(d.getDate() + 7 * interval);
    else if (unit === "months") d.setMonth(d.getMonth() + interval);

    if (endType === "on" && endDate && d > new Date(endDate)) return null;
    if (endType === "after" && endCount != null && sendCount + 1 >= endCount)
      return null;
  } else {
    return null;
  }

  return d;
}

export async function processReminder(
  jobs: Job<{ reminderId: number }>[]
) {
  for (const job of jobs) {
    const { reminderId } = job.data;

    try {
      const reminder = await prisma.reminder.findUnique({
        where: { id: reminderId },
        include: { user: true },
      });

      if (!reminder || reminder.status === "CANCELLED") continue;

      const rules = reminder.rules as ConditionalRule[];
      const attachments = (
        reminder.attachments as {
          name: string;
          contentType: string;
          contentBase64: string;
        }[]
      ).filter((a) => a.contentBase64);

      const scheduledAt = reminder.scheduledAt ?? new Date();

      const { body, subject, cc } = applyRules(
        reminder.bodyHtml,
        reminder.subject,
        reminder.ccAddresses,
        reminder.toAddresses,
        rules,
        scheduledAt,
        reminder.sendCount
      );

      await sendReminderEmail({
        fromEmail: process.env.MAIL_SENDER!,
        subject,
        toAddresses: reminder.toAddresses,
        ccAddresses: cc,
        bodyHtml: body,
        attachments,
      });

      const repeatConfig = reminder.repeatConfig as RepeatConfig | null;
      const nextAt = nextScheduledAt(
        scheduledAt,
        reminder.repeat,
        repeatConfig,
        reminder.sendCount
      );

      if (nextAt) {
        const newJobId = await global.__boss?.send(
          "send-reminder",
          { reminderId },
          { startAfter: nextAt }
        );
        await prisma.reminder.update({
          where: { id: reminderId },
          data: {
            status: "PENDING",
            sentAt: new Date(),
            sendCount: { increment: 1 },
            attempts: { increment: 1 },
            scheduledAt: nextAt,
            jobId: newJobId ?? undefined,
          },
        });
      } else {
        await prisma.reminder.update({
          where: { id: reminderId },
          data: {
            status: "SENT",
            sentAt: new Date(),
            sendCount: { increment: 1 },
            attempts: { increment: 1 },
          },
        });
      }
    } catch (error) {
      await prisma.reminder.update({
        where: { id: reminderId },
        data: {
          status: "FAILED",
          attempts: { increment: 1 },
          lastError:
            error instanceof Error ? error.message : String(error),
        },
      });
    }
  }
}
