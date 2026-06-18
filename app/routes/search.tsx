import { Link, useLoaderData } from "react-router";
import { SearchIcon } from "lucide-react";
import type { Route } from "./+types/search";

import { requireUserId } from "~/lib/session.server";
import { prisma } from "~/lib/db.server";

export async function loader({ request }: Route.LoaderArgs) {
  const userId = await requireUserId(request);
  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";

  if (!q) return { q, reminders: [] };

  const rows = await prisma.reminder.findMany({
    where: {
      userId,
      subject: { contains: q, mode: "insensitive" },
    },
    orderBy: [{ status: "asc" }, { scheduledAt: "asc" }],
    take: 50,
    select: {
      id: true,
      subject: true,
      toAddresses: true,
      status: true,
      scheduledAt: true,
      sentAt: true,
      updatedAt: true,
    },
  });

  return {
    q,
    reminders: rows.map((r) => {
      const dateVal =
        r.status === "SENT"
          ? r.sentAt ?? r.updatedAt
          : r.scheduledAt ?? r.updatedAt;
      const d = new Date(dateVal);
      const day = String(d.getDate()).padStart(2, "0");
      const month = d.toLocaleString("en-US", { month: "short" });
      const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      return {
        id: r.id,
        subject: r.subject,
        recipient: r.toAddresses[0] ?? "",
        status: r.status as "PENDING" | "SENT" | "DRAFT",
        day,
        month,
        time,
        href:
          r.status === "PENDING"
            ? `/upcoming/${r.id}`
            : r.status === "SENT"
            ? `/sent/${r.id}`
            : `/drafts/${r.id}`,
      };
    }),
  };
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Programado",
  SENT: "Enviado",
  DRAFT: "Borrador",
};

const STATUS_CLS: Record<string, string> = {
  PENDING: "bg-primary text-primary-foreground",
  SENT: "bg-green-100 text-green-800",
  DRAFT: "bg-muted text-muted-foreground",
};

export default function SearchResults() {
  const { q, reminders } = useLoaderData<typeof loader>();

  return (
    <div className="min-h-full px-6 pt-6 pb-12">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Resultados de búsqueda
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {q
              ? `${reminders.length} resultado${reminders.length !== 1 ? "s" : ""} para "${q}"`
              : "Escribe algo en el buscador para encontrar recordatorios."}
          </p>
        </div>

        {reminders.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
            <div className="flex h-12 w-12 items-center justify-center bg-muted">
              <SearchIcon className="size-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">
              {q ? "No se encontraron resultados" : "Sin búsqueda activa"}
            </p>
            <p className="text-xs text-muted-foreground">
              {q
                ? `Ningún recordatorio coincide con "${q}".`
                : "Usa el buscador de arriba para encontrar recordatorios."}
            </p>
          </div>
        ) : (
          <div className="border-t">
            {reminders.map((r) => (
              <Link
                key={r.id}
                to={r.href}
                className="grid grid-cols-[48px_1fr_auto] items-center gap-4 border-b border-l-[3px] border-l-transparent px-4 py-3 transition-colors duration-75 hover:bg-accent"
              >
                <div className="flex flex-col items-center justify-center bg-muted px-2 py-1.5 text-center">
                  <span className="text-base font-semibold leading-none">
                    {r.day}
                  </span>
                  <span className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                    {r.month}
                  </span>
                </div>

                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {r.subject || "(sin asunto)"}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {r.recipient || "(sin destinatario)"}
                  </p>
                </div>

                <div className="flex flex-col items-end gap-1">
                  <span
                    className={`px-2 py-0.5 text-[11px] font-medium ${STATUS_CLS[r.status] ?? "bg-muted text-muted-foreground"}`}
                  >
                    {STATUS_LABEL[r.status] ?? r.status}
                  </span>
                  <span className="text-xs text-muted-foreground">{r.time}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
