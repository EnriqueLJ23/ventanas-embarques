import { useEffect, useRef, useState } from "react";
import { Link, useFetcher } from "react-router";
import { autoSaveRegistry } from "~/lib/auto-save-registry";
import {
  RichBodyEditor,
  serializeForEmail,
  type Editor,
} from "~/components/rich-body-editor";
import {
  ArrowLeftIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  FileIcon,
  ImageIcon,
  PaperclipIcon,
  XIcon,
} from "lucide-react";

import { Button } from "~/components/ui/button";
import { Separator } from "~/components/ui/separator";
import type {
  Attachment,
  Repeat,
  RepeatConfig,
} from "~/lib/types";

export type ComposerData = {
  to?: string[];
  cc?: string[];
  subject?: string;
  body?: string;
  scheduleDate?: string;
  scheduleTime?: string;
  repeat?: Repeat;
  repeatConfig?: RepeatConfig;
  attachments?: Attachment[];
};

// ── Constants ────────────────────────────────────────────────────

const REPEAT_OPTIONS: { value: Repeat; label: string }[] = [
  { value: "never", label: "Nunca" },
  { value: "daily", label: "Diario" },
  { value: "weekly", label: "Semanal" },
  { value: "monthly", label: "Mensual" },
  { value: "custom", label: "Personalizado…" },
];

// ── RecipientInput ───────────────────────────────────────────────

function RecipientInput({
  value,
  recipients,
  onChange,
  onAdd,
  onRemove,
  placeholder,
}: {
  value: string;
  recipients: string[];
  onChange: (v: string) => void;
  onAdd: (email: string) => void;
  onRemove: (email: string) => void;
  placeholder: string;
}) {
  const fetcher = useFetcher<{ users: { name: string; email: string }[] }>();

  useEffect(() => {
    if (value.length < 2) return;
    const t = setTimeout(() => {
      fetcher.load(`/api/contacts/search?q=${encodeURIComponent(value)}`);
    }, 300);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const suggestions = (fetcher.data?.users ?? []).filter(
    (u) => !recipients.includes(u.email)
  );

  const commit = () => {
    const trimmed = value.trim().replace(/,+$/, "");
    if (trimmed) onAdd(trimmed);
  };

  return (
    <div className="relative flex flex-wrap items-center gap-1.5">
      {recipients.map((email) => (
        <span
          key={email}
          className="flex items-center gap-1 bg-muted px-2 py-0.5 text-xs"
        >
          {email}
          <button
            type="button"
            onClick={() => onRemove(email)}
            className="text-muted-foreground hover:text-foreground"
          >
            <XIcon className="size-3" />
          </button>
        </span>
      ))}
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            commit();
          }
          if (e.key === "Backspace" && !value && recipients.length > 0) {
            onRemove(recipients[recipients.length - 1]);
          }
        }}
        onBlur={commit}
        placeholder={recipients.length === 0 ? placeholder : ""}
        className="min-w-40 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
      {suggestions.length > 0 && value.length >= 2 && (
        <div className="absolute top-full left-0 z-50 mt-1 min-w-64 border bg-popover shadow-lg">
          {suggestions.map((c) => (
            <button
              key={c.email}
              type="button"
              className="flex w-full flex-col px-3 py-2 text-left hover:bg-accent"
              onMouseDown={(e) => {
                e.preventDefault();
                onAdd(c.email);
              }}
            >
              <span className="text-sm font-medium">{c.name}</span>
              <span className="text-xs text-muted-foreground">{c.email}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── ReminderComposer ─────────────────────────────────────────────

export function ReminderComposer({
  mode,
  reminderId,
  initialData = {},
  backTo,
  backLabel,
}: {
  mode: "new" | "edit";
  reminderId?: number;
  initialData?: ComposerData;
  backTo: string;
  backLabel: string;
}) {
  const [to, setTo] = useState(initialData.to ?? []);
  const [toInput, setToInput] = useState("");
  const [cc, setCc] = useState(initialData.cc ?? []);
  const [ccInput, setCcInput] = useState("");
  const [showCc, setShowCc] = useState((initialData.cc?.length ?? 0) > 0);
  const [subject, setSubject] = useState(initialData.subject ?? "");
  const [scheduleDate, setScheduleDate] = useState(
    initialData.scheduleDate ?? ""
  );
  const [scheduleTime, setScheduleTime] = useState(
    initialData.scheduleTime ?? ""
  );
  const [repeat, setRepeat] = useState<Repeat>(initialData.repeat ?? "never");

  const [customInterval, setCustomInterval] = useState(
    initialData.repeatConfig?.interval ?? 1
  );
  const [customUnit, setCustomUnit] = useState<"days" | "weeks" | "months">(
    initialData.repeatConfig?.unit ?? "weeks"
  );
  const [customEndType, setCustomEndType] = useState<"never" | "after" | "on">(
    initialData.repeatConfig?.endType ?? "never"
  );
  const [customEndCount, setCustomEndCount] = useState(
    initialData.repeatConfig?.endCount ?? 10
  );
  const [customEndDate, setCustomEndDate] = useState(
    initialData.repeatConfig?.endDate ?? ""
  );

  const [attachments, setAttachments] = useState<Attachment[]>(
    initialData.attachments ?? []
  );
  const [showAttachments, setShowAttachments] = useState(
    (initialData.attachments?.length ?? 0) > 0
  );

  const tiptapEditorRef = useRef<Editor | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);

  // Always-current snapshot for fire-and-forget auto-save when navigating via search
  const stateRef = useRef({
    to, cc, subject, scheduleDate, scheduleTime, repeat, attachments,
    customInterval, customUnit, customEndType, customEndCount, customEndDate,
  });
  stateRef.current = {
    to, cc, subject, scheduleDate, scheduleTime, repeat, attachments,
    customInterval, customUnit, customEndType, customEndCount, customEndDate,
  };

  useEffect(() => {
    if (mode !== "edit" || reminderId == null) return;
    autoSaveRegistry.register(() => {
      const s = stateRef.current;
      if (!s.scheduleDate || !s.scheduleTime) return;
      const fd = new FormData();
      fd.set("intent", "schedule");
      fd.set("subject", s.subject);
      fd.set("body", serializeForEmail(tiptapEditorRef.current?.getHTML() ?? ""));
      fd.set("to", JSON.stringify(s.to));
      fd.set("cc", JSON.stringify(s.cc));
      fd.set("attachments", JSON.stringify(s.attachments));
      fd.set("repeat", s.repeat);
      fd.set("scheduleDate", s.scheduleDate);
      fd.set("scheduleTime", s.scheduleTime);
      fd.set("scheduledAtISO", new Date(`${s.scheduleDate}T${s.scheduleTime}:00`).toISOString());
      fd.set("repeatConfig", JSON.stringify({
        interval: s.customInterval,
        unit: s.customUnit,
        endType: s.customEndType,
        endCount: s.customEndCount,
        endDate: s.customEndDate,
      }));
      fd.set("reminderId", String(reminderId));
      fetch(window.location.pathname, { method: "POST", body: fd }).catch(() => {});
    });
    return () => autoSaveRegistry.unregister();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, reminderId]);

  // Hidden inputs that get populated right before form submit
  const formRef = useRef<HTMLFormElement>(null);
  const hiddenBodyRef = useRef<HTMLInputElement>(null);
  const hiddenToRef = useRef<HTMLInputElement>(null);
  const hiddenCcRef = useRef<HTMLInputElement>(null);
  const hiddenAttachmentsRef = useRef<HTMLInputElement>(null);
  const hiddenIntentRef = useRef<HTMLInputElement>(null);
  const hiddenRepeatConfigRef = useRef<HTMLInputElement>(null);
  const hiddenScheduledAtISORef = useRef<HTMLInputElement>(null);
  const [scheduleError, setScheduleError] = useState("");

  const handleFileChange =
    (type: "file" | "image") =>
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      if (files.length === 0) return;

      const oversized = files.filter((f) => f.size > 3 * 1024 * 1024);
      if (oversized.length > 0) {
        alert(
          `These files exceed the 3 MB limit and were skipped:\n${oversized.map((f) => f.name).join("\n")}`
        );
      }

      const valid = files.filter((f) => f.size <= 3 * 1024 * 1024);
      if (valid.length === 0) {
        e.target.value = "";
        return;
      }

      const readFile = (file: File) =>
        new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () =>
            resolve((reader.result as string).split(",")[1] ?? "");
          reader.readAsDataURL(file);
        });

      const newAttachments = await Promise.all(
        valid.map(async (file, i) => ({
          id: Date.now() + i,
          name: file.name,
          size:
            file.size > 1_000_000
              ? `${(file.size / 1_000_000).toFixed(1)} MB`
              : `${Math.round(file.size / 1_000)} KB`,
          type,
          contentBase64: await readFile(file),
          contentType: file.type || "application/octet-stream",
        }))
      );

      setAttachments((prev) => [...prev, ...newAttachments]);
      setShowAttachments(true);
      e.target.value = "";
    };

  const handleSubmit = (intent: string) => {
    if (intent === "schedule") {
      if (!scheduleDate || !scheduleTime) {
        setScheduleError("Debes establecer una fecha y hora de envío antes de programar.");
        return;
      }
    }
    setScheduleError("");

    if (hiddenBodyRef.current)
      hiddenBodyRef.current.value = serializeForEmail(
        tiptapEditorRef.current?.getHTML() ?? ""
      );
    if (hiddenToRef.current) hiddenToRef.current.value = JSON.stringify(to);
    if (hiddenCcRef.current) hiddenCcRef.current.value = JSON.stringify(cc);
    if (hiddenAttachmentsRef.current)
      hiddenAttachmentsRef.current.value = JSON.stringify(attachments);
    if (hiddenIntentRef.current) hiddenIntentRef.current.value = intent;
    if (hiddenRepeatConfigRef.current) {
      hiddenRepeatConfigRef.current.value = JSON.stringify({
        interval: customInterval,
        unit: customUnit,
        endType: customEndType,
        endCount: customEndCount,
        endDate: customEndDate,
      });
    }
    // Compute a timezone-aware ISO timestamp from the local date/time inputs
    if (hiddenScheduledAtISORef.current) {
      if (scheduleDate && scheduleTime) {
        // new Date without timezone suffix is interpreted as LOCAL time by the browser
        hiddenScheduledAtISORef.current.value = new Date(
          `${scheduleDate}T${scheduleTime}:00`
        ).toISOString();
      } else {
        hiddenScheduledAtISORef.current.value = "";
      }
    }
    formRef.current?.submit();
  };

  const title =
    mode === "new" ? "Nuevo recordatorio" : subject || "Editar recordatorio";

  const fieldCls =
    "border border-border bg-transparent px-2 py-1 text-sm outline-none focus:border-primary";

  return (
    <div className="px-6 pt-6 pb-12">
      <form ref={formRef} method="post">
        {/* Hidden serialized fields */}
        <input ref={hiddenIntentRef} type="hidden" name="intent" />
        <input ref={hiddenBodyRef} type="hidden" name="body" />
        <input ref={hiddenToRef} type="hidden" name="to" />
        <input ref={hiddenCcRef} type="hidden" name="cc" />
        <input ref={hiddenAttachmentsRef} type="hidden" name="attachments" />
        <input ref={hiddenRepeatConfigRef} type="hidden" name="repeatConfig" />
        <input ref={hiddenScheduledAtISORef} type="hidden" name="scheduledAtISO" />
        {reminderId != null && (
          <input type="hidden" name="reminderId" value={reminderId} />
        )}

        <div className="border bg-card">
          {/* ── Toolbar ── */}
          <div className="flex items-center gap-2 border-b bg-muted/40 px-4 py-2">
            <Link
              to={backTo}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeftIcon className="size-3.5" />
              {backLabel}
            </Link>
            <Separator orientation="vertical" className="mx-1 h-4" />
            <span className="text-sm font-medium">{title}</span>
            <div className="flex-1" />
            {mode === "edit" && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() => handleSubmit("delete")}
              >
                Eliminar
              </Button>
            )}
            {scheduleError && (
              <span className="text-xs text-destructive">{scheduleError}</span>
            )}
            <Button
              type="button"
              size="sm"
              onClick={() => handleSubmit("schedule")}
            >
              {mode === "edit" ? "Actualizar programación" : "Programar"}
            </Button>
          </div>

          {/* ── To ── */}
          <div className="flex items-start border-b">
            <span className="w-20 shrink-0 px-4 py-3 text-sm text-muted-foreground">
              Para
            </span>
            <div className="flex-1 px-2 py-2.5">
              <RecipientInput
                value={toInput}
                recipients={to}
                onChange={setToInput}
                onAdd={(email) => {
                  if (!to.includes(email)) setTo((p) => [...p, email]);
                  setToInput("");
                }}
                onRemove={(email) => setTo((p) => p.filter((e) => e !== email))}
                placeholder="Agregar destinatarios de Entra ID o escribe un correo…"
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mx-3 my-1.5 h-7 text-xs text-muted-foreground"
              onClick={() => setShowCc((v) => !v)}
            >
              {showCc ? "Ocultar CC" : "CC"}
            </Button>
          </div>

          {/* ── CC ── */}
          {showCc && (
            <div className="flex items-start border-b">
              <span className="w-20 shrink-0 px-4 py-3 text-sm text-muted-foreground">
                CC
              </span>
              <div className="flex-1 px-2 py-2.5">
                <RecipientInput
                  value={ccInput}
                  recipients={cc}
                  onChange={setCcInput}
                  onAdd={(email) => {
                    if (!cc.includes(email)) setCc((p) => [...p, email]);
                    setCcInput("");
                  }}
                  onRemove={(email) =>
                    setCc((p) => p.filter((e) => e !== email))
                  }
                  placeholder="Agregar destinatarios CC…"
                />
              </div>
            </div>
          )}

          {/* ── Subject ── */}
          <div className="flex items-center border-b">
            <span className="w-20 shrink-0 px-4 py-3 text-sm text-muted-foreground">
              Asunto
            </span>
            <input
              type="text"
              name="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Línea de asunto del recordatorio…"
              className="flex-1 bg-transparent px-2 py-3 text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>

          {/* ── Schedule + Repeat ── */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-b px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Enviar el</span>
              <input
                type="date"
                name="scheduleDate"
                value={scheduleDate}
                onChange={(e) => setScheduleDate(e.target.value)}
                className={fieldCls}
              />
              <span className="text-xs text-muted-foreground">a las</span>
              <input
                type="time"
                name="scheduleTime"
                value={scheduleTime}
                onChange={(e) => setScheduleTime(e.target.value)}
                className={fieldCls}
              />
            </div>

            <Separator orientation="vertical" className="h-5" />

            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Repetir</span>
              <select
                name="repeat"
                value={repeat}
                onChange={(e) => setRepeat(e.target.value as Repeat)}
                className={fieldCls}
              >
                {REPEAT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* ── Custom repeat ── */}
          {repeat === "custom" && (
            <div className="flex flex-wrap items-center gap-3 border-b bg-muted/20 px-4 py-2.5 text-xs">
              <span className="text-muted-foreground">Cada</span>
              <input
                type="number"
                min="1"
                max="365"
                value={customInterval}
                onChange={(e) => setCustomInterval(Number(e.target.value))}
                className={`${fieldCls} w-14 text-xs`}
              />
              <select
                value={customUnit}
                onChange={(e) =>
                  setCustomUnit(e.target.value as "days" | "weeks" | "months")
                }
                className={`${fieldCls} text-xs`}
              >
                <option value="days">días</option>
                <option value="weeks">semanas</option>
                <option value="months">meses</option>
              </select>

              <Separator orientation="vertical" className="h-4" />

              <span className="text-muted-foreground">Termina</span>
              <select
                value={customEndType}
                onChange={(e) =>
                  setCustomEndType(
                    e.target.value as "never" | "after" | "on"
                  )
                }
                className={`${fieldCls} text-xs`}
              >
                <option value="never">Nunca</option>
                <option value="after">Después de</option>
                <option value="on">En fecha</option>
              </select>
              {customEndType === "after" && (
                <>
                  <input
                    type="number"
                    min="1"
                    value={customEndCount}
                    onChange={(e) =>
                      setCustomEndCount(Number(e.target.value))
                    }
                    className={`${fieldCls} w-14 text-xs`}
                  />
                  <span className="text-muted-foreground">ocurrencias</span>
                </>
              )}
              {customEndType === "on" && (
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className={`${fieldCls} text-xs`}
                />
              )}
            </div>
          )}

          {/* ── Body (rich text editor — Tiptap SimpleEditor template) ── */}
          <RichBodyEditor
            initialValue={initialData.body}
            editorRef={tiptapEditorRef}
          />

          {/* ── Attachments ── */}
          <div className="border-t">
            <div className="flex items-center">
              <button
                type="button"
                className="flex flex-1 items-center gap-2 px-4 py-2.5 text-sm hover:bg-accent"
                onClick={() => setShowAttachments((v) => !v)}
              >
                {showAttachments ? (
                  <ChevronDownIcon className="size-3.5 text-muted-foreground" />
                ) : (
                  <ChevronRightIcon className="size-3.5 text-muted-foreground" />
                )}
                <span className="font-medium">Adjuntos</span>
                {attachments.length > 0 && (
                  <span className="bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 text-[10px] font-medium">
                    {attachments.length}
                  </span>
                )}
              </button>
              <div className="flex items-center gap-1 pr-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 text-xs text-muted-foreground"
                  onClick={() => { setShowAttachments(true); fileRef.current?.click(); }}
                >
                  <PaperclipIcon className="size-3.5" />
                  Adjuntar
                </Button>
              </div>
            </div>

            {showAttachments && (
              <div className="space-y-2 border-t px-4 py-3">
                {attachments.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Sin adjuntos.
                  </p>
                ) : (
                  <div className="space-y-1">
                    {attachments.map((a) => (
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
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {a.size}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setAttachments((prev) =>
                              prev.filter((x) => x.id !== a.id)
                            )
                          }
                          className="shrink-0 text-muted-foreground hover:text-destructive"
                        >
                          <XIcon className="size-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </form>

      <input
        ref={fileRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileChange("file")}
      />
    </div>
  );
}
