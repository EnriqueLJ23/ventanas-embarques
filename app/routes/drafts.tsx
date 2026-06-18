import { useState } from "react";
import { FileTextIcon } from "lucide-react";
import { Link, useLoaderData } from "react-router";
import type { Route } from "./+types/drafts";

import { requireUserId } from "~/lib/session.server";
import { getDrafts } from "~/services/reminders.server";
import { Button } from "~/components/ui/button";

const FILTERS = ["Todos", "Recientes"] as const;
type Filter = (typeof FILTERS)[number];

export async function loader({ request }: Route.LoaderArgs) {
  const userId = await requireUserId(request);
  const drafts = await getDrafts(userId);

  const now = new Date();
  const weekAgo = new Date(now);
  weekAgo.setDate(now.getDate() - 7);

  return {
    drafts: drafts.map((d) => {
      const updated = new Date(d.updatedAt);
      const isRecent = updated >= weekAgo;
      const day = String(updated.getDate()).padStart(2, "0");
      const month = updated.toLocaleString("en-US", { month: "short" });
      const bodyPreview = d.bodyHtml
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 80);
      return {
        id: d.id,
        subject: d.subject,
        recipient: d.toAddresses[0] ?? "",
        day,
        month,
        preview: bodyPreview || "(empty)",
        age: isRecent ? ("recent" as const) : ("older" as const),
      };
    }),
  };
}

export default function Drafts() {
  const { drafts } = useLoaderData<typeof loader>();
  const [filter, setFilter] = useState<Filter>("Todos");

  const filtered = drafts.filter((d) => {
    if (filter === "Recientes") return d.age === "recent";
    return true;
  });

  return (
    <div className="min-h-full px-6 pt-6 pb-12">
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Borradores</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Recordatorios que iniciaste pero aún no has programado.
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
              <FileTextIcon className="size-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">No hay borradores</p>
            <p className="text-xs text-muted-foreground">
              Los borradores que guardes aparecerán aquí.
            </p>
          </div>
        ) : (
          <div className="border-t">
            {filtered.map((draft) => (
              <Link
                key={draft.id}
                to={`/drafts/${draft.id}`}
                className="grid grid-cols-[48px_1fr_auto] items-center gap-4 border-b border-l-[3px] border-l-transparent px-4 py-3 transition-colors duration-75 hover:bg-accent"
              >
                <div className="flex flex-col items-center justify-center bg-muted px-2 py-1.5 text-center">
                  <span className="text-base font-semibold leading-none">
                    {draft.day}
                  </span>
                  <span className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                    {draft.month}
                  </span>
                </div>

                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {draft.subject || "(no subject)"}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {draft.recipient || "(no recipient)"}
                  </p>
                  <p className="mt-1 truncate text-xs text-muted-foreground/70 italic">
                    {draft.preview}
                  </p>
                </div>

                <div className="flex flex-col items-end gap-1">
                  <span className="px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    Borrador
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
