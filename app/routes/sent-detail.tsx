import { redirect } from "react-router";
import { Link, useLoaderData } from "react-router";
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  CopyIcon,
  FileIcon,
  ImageIcon,
  RepeatIcon,
} from "lucide-react";
import type { Route } from "./+types/sent-detail";

import { requireUserId } from "~/lib/session.server";
import {
  getReminderById,
  duplicateAsDraft,
} from "~/services/reminders.server";
import { Button } from "~/components/ui/button";
import { Separator } from "~/components/ui/separator";
import type { Attachment } from "~/lib/types";

function ReadRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start border-b">
      <span className="w-20 shrink-0 px-4 py-3 text-sm text-muted-foreground">
        {label}
      </span>
      <div className="flex-1 px-2 py-3">{children}</div>
    </div>
  );
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const userId = await requireUserId(request);
  const reminder = await getReminderById(Number(params.id), userId);
  if (!reminder) throw new Response("Not found", { status: 404 });

  const sentAt = reminder.sentAt
    ? new Date(reminder.sentAt)
    : new Date(reminder.updatedAt);

  return {
    id: reminder.id,
    subject: reminder.subject,
    to: reminder.toAddresses,
    cc: reminder.ccAddresses,
    bodyHtml: reminder.bodyHtml,
    repeat: reminder.repeat,
    attachments: reminder.attachments as Attachment[],
    sentDate: sentAt.toISOString(),
    sentTime: `${String(sentAt.getHours()).padStart(2, "0")}:${String(sentAt.getMinutes()).padStart(2, "0")}`,
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const userId = await requireUserId(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "duplicate") {
    const draft = await duplicateAsDraft(Number(params.id), userId);
    return redirect(`/drafts/${draft.id}`);
  }

  return redirect("/sent");
}

export default function SentDetail() {
  const item = useLoaderData<typeof loader>();

  const sentAtDate = new Date(item.sentDate);

  return (
    <div className="px-6 pt-6 pb-12">
      <div className="border bg-card">
        {/* ── Toolbar ── */}
        <div className="flex items-center gap-2 border-b bg-muted/40 px-4 py-2">
          <Link
            to="/sent"
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeftIcon className="size-3.5" />
            Enviados
          </Link>
          <Separator orientation="vertical" className="mx-1 h-4" />
          <span className="text-sm font-medium">{item.subject}</span>
          <div className="flex-1" />
          <span className="flex items-center gap-1.5 text-xs font-medium sent-delivered-badge">
            <CheckCircleIcon className="size-3.5" />
            Entregado{" "}
            {sentAtDate.toLocaleDateString("es-MX", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}{" "}
            at {item.sentTime}
          </span>
          <Separator orientation="vertical" className="mx-1 h-4" />
          <form method="post">
            <input type="hidden" name="intent" value="duplicate" />
            <Button type="submit" variant="outline" size="sm" className="gap-1">
              <CopyIcon className="size-3.5" />
              Duplicar como nuevo
            </Button>
          </form>
        </div>

        {/* ── Recipients ── */}
        <ReadRow label="Para">
          <div className="flex flex-wrap gap-1.5">
            {item.to.map((email) => (
              <span key={email} className="bg-muted px-2 py-0.5 text-xs">
                {email}
              </span>
            ))}
          </div>
        </ReadRow>

        {item.cc.length > 0 && (
          <ReadRow label="CC">
            <div className="flex flex-wrap gap-1.5">
              {item.cc.map((email) => (
                <span key={email} className="bg-muted px-2 py-0.5 text-xs">
                  {email}
                </span>
              ))}
            </div>
          </ReadRow>
        )}

        <ReadRow label="Asunto">
          <span className="text-sm font-medium">{item.subject}</span>
        </ReadRow>

        {/* ── Schedule meta ── */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b px-4 py-3 text-xs text-muted-foreground">
          <span>
            Enviado el{" "}
            <span className="font-medium text-foreground">
              {sentAtDate.toLocaleDateString("es-MX", {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </span>{" "}
            a las{" "}
            <span className="font-medium text-foreground">{item.sentTime}</span>
          </span>
          {item.repeat !== "never" && (
            <>
              <Separator orientation="vertical" className="h-3" />
              <span className="flex items-center gap-1">
                <RepeatIcon className="size-3" />
                Se repite{" "}
                <span className="font-medium capitalize text-foreground">
                  {item.repeat}
                </span>
              </span>
            </>
          )}
        </div>

        {/* ── Body ── */}
        <div
          className="px-4 py-4 text-sm leading-relaxed"
          dangerouslySetInnerHTML={{ __html: item.bodyHtml }}
        />

        {/* ── Attachments ── */}
        {item.attachments.length > 0 && (
          <div className="border-t px-4 py-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              Adjuntos ({item.attachments.length})
            </p>
            <div className="space-y-1">
              {item.attachments.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center gap-2 border border-border px-3 py-2"
                >
                  {a.type === "image" ? (
                    <ImageIcon className="size-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <FileIcon className="size-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="flex-1 truncate text-xs">{a.name}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {a.size}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
