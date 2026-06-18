import { redirect } from "react-router";
import { useLoaderData } from "react-router";
import type { Route } from "./+types/drafts-detail";

import { requireUserId } from "~/lib/session.server";
import {
  getReminderById,
  updateDraft,
  promoteToScheduled,
  deleteReminder,
  parseReminderForm,
  formatScheduledAt,
} from "~/services/reminders.server";
import { ReminderComposer } from "~/components/reminder-composer";
import type { ConditionalRule, Attachment, Repeat, RepeatConfig } from "~/lib/types";

export async function loader({ request, params }: Route.LoaderArgs) {
  const userId = await requireUserId(request);
  const reminder = await getReminderById(Number(params.id), userId);
  if (!reminder) throw new Response("Not found", { status: 404 });

  const { scheduleDate, scheduleTime } = reminder.scheduledAt
    ? formatScheduledAt(new Date(reminder.scheduledAt))
    : { scheduleDate: "", scheduleTime: "" };

  const repeatConfig = reminder.repeatConfig as RepeatConfig | undefined;

  return {
    reminderId: reminder.id,
    initialData: {
      to: reminder.toAddresses,
      cc: reminder.ccAddresses,
      subject: reminder.subject,
      body: reminder.bodyHtml,
      scheduleDate,
      scheduleTime,
      repeat: reminder.repeat as Repeat,
      repeatConfig,
      rules: reminder.rules as ConditionalRule[],
      attachments: reminder.attachments as Attachment[],
    },
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const userId = await requireUserId(request);
  const id = Number(params.id);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "delete") {
    await deleteReminder(id, userId);
    return redirect("/upcoming");
  }

  const data = parseReminderForm(formData);

  if (intent === "schedule") {
    await promoteToScheduled(id, userId, data);
    return redirect("/upcoming");
  }

  await updateDraft(id, userId, data);
  return redirect("/upcoming");
}

export default function DraftsDetail() {
  const { reminderId, initialData } = useLoaderData<typeof loader>();

  return (
    <ReminderComposer
      mode="edit"
      reminderId={reminderId}
      initialData={initialData}
      backTo="/drafts"
      backLabel="Borradores"
    />
  );
}
