import { redirect } from "react-router";
import type { Route } from "./+types/new-reminder";

import { requireUserId } from "~/lib/session.server";
import {
  scheduleNewReminder,
  parseReminderForm,
} from "~/services/reminders.server";
import { ReminderComposer } from "~/components/reminder-composer";

export async function action({ request }: Route.ActionArgs) {
  const userId = await requireUserId(request);
  const formData = await request.formData();
  const data = parseReminderForm(formData);

  await scheduleNewReminder(userId, data);
  return redirect("/upcoming");
}

export default function NewReminder() {
  return <ReminderComposer mode="new" backTo="/upcoming" backLabel="Próximos" />;
}
