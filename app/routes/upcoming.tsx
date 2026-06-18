import { useState } from "react";
import { BellOffIcon } from "lucide-react";
import { Link, useLoaderData } from "react-router";
import type { Route } from "./+types/upcoming";

import { requireUserId } from "~/lib/session.server";
import { getUpcoming } from "~/services/reminders.server";
import { Button } from "~/components/ui/button";

const FILTERS = ["Todos", "Hoy", "Esta semana"] as const;
type Filter = (typeof FILTERS)[number];

export async function loader({ request }: Route.LoaderArgs) {
  const userId = await requireUserId(request);
  const reminders = await getUpcoming(userId);

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const weekEnd = new Date(now);
  weekEnd.setDate(now.getDate() + 7);

  return {
    reminders: reminders.map((r) => {
      const d = r.scheduledAt ? new Date(r.scheduledAt) : null;
      const dateStr = d
        ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
        : "";
      const isToday = dateStr === todayStr;
      const isThisWeek = d ? d <= weekEnd : false;
      const time = d
        ? `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
        : "";
      const day = d ? String(d.getDate()).padStart(2, "0") : "--";
      const month = d
        ? d.toLocaleString("en-US", { month: "short" })
        : "---";
      return {
        id: r.id,
        subject: r.subject,
        recipient: r.toAddresses[0] ?? "",
        day,
        month,
        time,
        status: isToday ? ("today" as const) : ("upcoming" as const),
        isThisWeek,
      };
    }),
  };
}

export default function Upcoming() {
  const { reminders } = useLoaderData<typeof loader>();
  const [filter, setFilter] = useState<Filter>("Todos");

  const filtered = reminders.filter((r) => {
    if (filter === "Hoy") return r.status === "today";
    if (filter === "Esta semana") return r.isThisWeek || r.status === "today";
    return true;
  });

  return (
    <div className="min-h-full px-6 pt-6 pb-12">
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Próximos recordatorios
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Tus recordatorios programados, listos para enviar. Haz clic en cualquiera para editar.
            </p>
          </div>

          <div className="flex items-center gap-0 border-b">
            {FILTERS.map((f) => (
              <Button
                key={f}
                size="sm"
                variant="ghost"
                className={`h-8 rounded-none border-b-2 px-4 text-xs transition-none ${
                  filter === f
                    ? "border-b-primary text-primary font-semibold"
                    : "border-b-transparent text-muted-foreground"
                }`}
                onClick={() => setFilter(f)}
              >
                {f}
              </Button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
            <div className="flex h-12 w-12 items-center justify-center bg-muted">
              <BellOffIcon className="size-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">No se encontraron recordatorios para este período</p>
            <p className="text-xs text-muted-foreground">
              Cambia a Todos para ver todo.
            </p>
          </div>
        ) : (
          <div className="border-t">
            {filtered.map((reminder) => (
              <Link
                key={reminder.id}
                to={`/upcoming/${reminder.id}`}
                className={`grid grid-cols-[48px_1fr_auto] items-center gap-4 border-b border-l-[3px] px-4 py-3 transition-colors duration-75 hover:bg-accent ${
                  reminder.status === "today"
                    ? "border-l-primary"
                    : "border-l-transparent"
                }`}
              >
                <div className="flex flex-col items-center justify-center bg-muted px-2 py-1.5 text-center">
                  <span className="text-base font-semibold leading-none">
                    {reminder.day}
                  </span>
                  <span className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                    {reminder.month}
                  </span>
                </div>

                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {reminder.subject}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {reminder.recipient}
                  </p>
                </div>

                <div className="flex flex-col items-end gap-1">
                  <span
                    className={`px-2 py-0.5 text-[11px] font-medium ${
                      reminder.status === "today"
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground"
                    }`}
                  >
                    {reminder.status === "today" ? "Hoy" : "Próximo"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {reminder.time}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
