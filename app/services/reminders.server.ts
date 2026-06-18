import { Prisma } from "@prisma/client";
import { prisma } from "~/lib/db.server";
import { scheduleReminderJob, cancelReminderJob } from "./boss.server";
import type { ConditionalRule, Repeat, RepeatConfig, Attachment } from "~/lib/types";

function toJsonNull(val: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (val === null || val === undefined) return Prisma.JsonNull;
  return val as Prisma.InputJsonValue;
}

export type ReminderInput = {
  subject: string;
  toAddresses: string[];
  ccAddresses: string[];
  bodyHtml: string;
  scheduledAt?: Date;
  repeat: Repeat;
  repeatConfig?: RepeatConfig;
  rules: ConditionalRule[];
  attachments: Attachment[];
};

export function parseReminderForm(formData: FormData): ReminderInput {
  const subject = (formData.get("subject") as string) ?? "";
  const bodyHtml = (formData.get("body") as string) ?? "";
  const scheduledAtISO = (formData.get("scheduledAtISO") as string) ?? "";
  const scheduleDate = (formData.get("scheduleDate") as string) ?? "";
  const scheduleTime = (formData.get("scheduleTime") as string) ?? "";
  const repeat = ((formData.get("repeat") as string) ?? "never") as Repeat;
  const repeatConfigStr = (formData.get("repeatConfig") as string) ?? "{}";
  const toStr = (formData.get("to") as string) ?? "[]";
  const ccStr = (formData.get("cc") as string) ?? "[]";
  const rulesStr = (formData.get("rules") as string) ?? "[]";
  const attachmentsStr = (formData.get("attachments") as string) ?? "[]";

  let scheduledAt: Date | undefined;
  if (scheduledAtISO) {
    scheduledAt = new Date(scheduledAtISO);
  } else if (scheduleDate && scheduleTime) {
    scheduledAt = new Date(`${scheduleDate}T${scheduleTime}:00`);
  }

  return {
    subject,
    bodyHtml,
    scheduledAt,
    repeat,
    repeatConfig:
      repeat === "custom" ? (JSON.parse(repeatConfigStr) as RepeatConfig) : undefined,
    toAddresses: JSON.parse(toStr) as string[],
    ccAddresses: JSON.parse(ccStr) as string[],
    rules: JSON.parse(rulesStr) as ConditionalRule[],
    attachments: JSON.parse(attachmentsStr) as Attachment[],
  };
}

export async function createDraft(userId: number, data: ReminderInput) {
  return prisma.reminder.create({
    data: {
      userId,
      subject: data.subject,
      toAddresses: data.toAddresses,
      ccAddresses: data.ccAddresses,
      bodyHtml: data.bodyHtml,
      scheduledAt: data.scheduledAt,
      repeat: data.repeat,
      repeatConfig: toJsonNull(data.repeatConfig),
      rules: data.rules as object[],
      attachments: data.attachments as object[],
      status: "DRAFT",
    },
  });
}

export async function scheduleNewReminder(userId: number, data: ReminderInput) {
  if (!data.scheduledAt) throw new Error("scheduledAt is required to schedule");

  const reminder = await prisma.reminder.create({
    data: {
      userId,
      subject: data.subject,
      toAddresses: data.toAddresses,
      ccAddresses: data.ccAddresses,
      bodyHtml: data.bodyHtml,
      scheduledAt: data.scheduledAt,
      repeat: data.repeat,
      repeatConfig: toJsonNull(data.repeatConfig),
      rules: data.rules as object[],
      attachments: data.attachments as object[],
      status: "PENDING",
    },
  });

  const jobId = await scheduleReminderJob(reminder.id, data.scheduledAt);
  return prisma.reminder.update({ where: { id: reminder.id }, data: { jobId } });
}

export async function updateDraft(id: number, userId: number, data: ReminderInput) {
  const existing = await prisma.reminder.findFirst({ where: { id, userId } });
  if (!existing) throw new Error("Reminder not found");

  return prisma.reminder.update({
    where: { id },
    data: {
      subject: data.subject,
      toAddresses: data.toAddresses,
      ccAddresses: data.ccAddresses,
      bodyHtml: data.bodyHtml,
      scheduledAt: data.scheduledAt,
      repeat: data.repeat,
      repeatConfig: toJsonNull(data.repeatConfig),
      rules: data.rules as object[],
      attachments: data.attachments as object[],
      status: "DRAFT",
    },
  });
}

export async function promoteToScheduled(id: number, userId: number, data: ReminderInput) {
  if (!data.scheduledAt) throw new Error("scheduledAt is required");

  const existing = await prisma.reminder.findFirst({ where: { id, userId } });
  if (!existing) throw new Error("Reminder not found");

  if (existing.jobId) await cancelReminderJob(existing.jobId);

  const updated = await prisma.reminder.update({
    where: { id },
    data: {
      subject: data.subject,
      toAddresses: data.toAddresses,
      ccAddresses: data.ccAddresses,
      bodyHtml: data.bodyHtml,
      scheduledAt: data.scheduledAt,
      repeat: data.repeat,
      repeatConfig: toJsonNull(data.repeatConfig),
      rules: data.rules as object[],
      attachments: data.attachments as object[],
      status: "PENDING",
    },
  });

  const jobId = await scheduleReminderJob(id, data.scheduledAt);
  return prisma.reminder.update({ where: { id }, data: { jobId } });
}

export async function updateScheduled(id: number, userId: number, data: ReminderInput) {
  if (!data.scheduledAt) throw new Error("scheduledAt is required");

  const existing = await prisma.reminder.findFirst({ where: { id, userId } });
  if (!existing) throw new Error("Reminder not found");

  if (existing.jobId) await cancelReminderJob(existing.jobId);

  await prisma.reminder.update({
    where: { id },
    data: {
      subject: data.subject,
      toAddresses: data.toAddresses,
      ccAddresses: data.ccAddresses,
      bodyHtml: data.bodyHtml,
      scheduledAt: data.scheduledAt,
      repeat: data.repeat,
      repeatConfig: toJsonNull(data.repeatConfig),
      rules: data.rules as object[],
      attachments: data.attachments as object[],
      status: "PENDING",
    },
  });

  const jobId = await scheduleReminderJob(id, data.scheduledAt);
  return prisma.reminder.update({ where: { id }, data: { jobId } });
}

export async function deleteReminder(id: number, userId: number) {
  const existing = await prisma.reminder.findFirst({ where: { id, userId } });
  if (!existing) throw new Error("Reminder not found");

  if (existing.jobId) await cancelReminderJob(existing.jobId);
  return prisma.reminder.delete({ where: { id } });
}

export async function getUpcoming(userId: number) {
  return prisma.reminder.findMany({
    where: { userId, status: "PENDING" },
    orderBy: { scheduledAt: "asc" },
  });
}

export async function getDrafts(userId: number) {
  return prisma.reminder.findMany({
    where: { userId, status: "DRAFT" },
    orderBy: { updatedAt: "desc" },
  });
}

export async function getSent(userId: number) {
  return prisma.reminder.findMany({
    where: { userId, status: "SENT" },
    orderBy: { sentAt: "desc" },
    take: 100,
  });
}

export async function getReminderById(id: number, userId: number) {
  return prisma.reminder.findFirst({ where: { id, userId } });
}

export async function duplicateAsDraft(id: number, userId: number) {
  const existing = await prisma.reminder.findFirst({ where: { id, userId } });
  if (!existing) throw new Error("Reminder not found");

  return prisma.reminder.create({
    data: {
      userId,
      subject: `Copy of ${existing.subject}`,
      toAddresses: existing.toAddresses,
      ccAddresses: existing.ccAddresses,
      bodyHtml: existing.bodyHtml,
      repeat: existing.repeat,
      repeatConfig: toJsonNull(existing.repeatConfig),
      rules: existing.rules as Prisma.InputJsonValue,
      attachments: existing.attachments as Prisma.InputJsonValue,
      status: "DRAFT",
    },
  });
}

export function formatScheduledAt(d: Date) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return { scheduleDate: `${year}-${month}-${day}`, scheduleTime: `${hours}:${minutes}` };
}
