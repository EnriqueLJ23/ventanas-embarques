import { useState } from "react";
import { CheckIcon, SendIcon } from "lucide-react";
import { Link, useLoaderData } from "react-router";
import type { Route } from "./+types/sent";

import { requireUserId } from "~/lib/session.server";
import { getSent } from "~/services/reminders.server";
import { Button } from "~/components/ui/button";

const FILTERS = ["Todos", "Hoy", "Esta semana"] as const;
type Filter = (typeof FILTERS)[number];

export async function loader({ request }: Route.LoaderArgs) {
  const userId = await requireUserId(request);
  const sent = await getSent(userId);

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const weekAgo = new Date(now);
  weekAgo.setDate(now.getDate() - 7);

  return {
    sent: sent.map((s) => {
      const sentAt = s.sentAt ? new Date(s.sentAt) : new Date(s.updatedAt);
      const dateStr = `${sentAt.getFullYear()}-${String(sentAt.getMonth() + 1).padStart(2, "0")}-${String(sentAt.getDate()).padStart(2, "0")}`;
      const isToday = dateStr === todayStr;
      const isThisWeek = sentAt >= weekAgo;
      const time = `${String(sentAt.getHours()).padStart(2, "0")}:${String(sentAt.getMinutes()).padStart(2, "0")}`;
      const day = String(sentAt.getDate()).padStart(2, "0");
      const month = sentAt.toLocaleString("en-US", { month: "short" });
      return {
        id: s.id,
        subject: s.subject,
        recipient: s.toAddresses[0] ?? "",
        day,
        month,
        time,
        period: isToday
          ? ("today" as const)
          : isThisWeek
          ? ("week" as const)
          : ("older" as const),
      };
    }),
  };
}

export default function Sent() {
  const { sent } = useLoaderData<typeof loader>();
  const [filter, setFilter] = useState<Filter>("Todos");

  const filtered = sent.filter((s) => {
    if (filter === "Hoy") return s.period === "today";
    if (filter === "Esta semana")
      return s.period === "today" || s.period === "week";
    return true;
  });

  return (
    <div className="min-h-full px-6 pt-6 pb-12">
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Enviados</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Recordatorios que ya han sido entregados.
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
              <SendIcon className="size-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">Aún no se ha enviado nada</p>
            <p className="text-xs text-muted-foreground">
              Los recordatorios entregados aparecerán aquí.
            </p>
          </div>
        ) : (
          <div className="border-t">
            {filtered.map((item) => (
              <Link
                key={item.id}
                to={`/sent/${item.id}`}
                className="grid grid-cols-[48px_1fr_auto] items-center gap-4 border-b border-l-[3px] border-l-transparent px-4 py-3 transition-colors duration-75 hover:bg-accent"
              >
                <div className="flex flex-col items-center justify-center bg-muted px-2 py-1.5 text-center">
                  <span className="text-base font-semibold leading-none">
                    {item.day}
                  </span>
                  <span className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                    {item.month}
                  </span>
                </div>

                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-muted-foreground">
                    {item.subject}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground/70">
                    {item.recipient}
                  </p>
                </div>

                <div className="flex flex-col items-end gap-1">
                  <span className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                    <CheckIcon className="size-3" />
                    Enviado
                  </span>
                  <span className="text-xs text-muted-foreground/70">
                    {item.time}
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
