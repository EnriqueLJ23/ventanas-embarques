import { useEffect, useRef, useState } from "react";
import { useFetcher, useNavigate } from "react-router";
import { SearchIcon } from "lucide-react";
import { autoSaveRegistry } from "~/lib/auto-save-registry";

type SearchResult = {
  id: number;
  subject: string;
  recipient: string;
  status: string;
  scheduledAt: string | null;
  sentAt: string | null;
  updatedAt: string;
  href: string;
};

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

function formatDate(r: SearchResult): string {
  const raw = r.status === "SENT" ? r.sentAt : r.scheduledAt ?? r.updatedAt;
  if (!raw) return "";
  const d = new Date(raw);
  const day = String(d.getDate()).padStart(2, "0");
  const month = d.toLocaleString("es-ES", { month: "short" });
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${day} ${month} · ${h}:${m}`;
}

export function SearchForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const navigate = useNavigate();
  const fetcher = useFetcher<{ reminders: SearchResult[] }>();

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounced fetch
  useEffect(() => {
    if (query.length < 1) {
      setOpen(false);
      return;
    }
    const t = setTimeout(() => {
      fetcher.load(`/api/reminders/search?q=${encodeURIComponent(query)}`);
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const results = fetcher.data?.reminders ?? [];

  useEffect(() => {
    if (results.length > 0 && query.length > 0) {
      setOpen(true);
      setSelectedIndex(-1);
    } else if (query.length < 1) {
      setOpen(false);
    }
  }, [results, query]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const goTo = (href: string) => {
    autoSaveRegistry.trigger();
    setOpen(false);
    setQuery("");
    navigate(href);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open && results.length > 0) setOpen(true);
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (selectedIndex >= 0 && results[selectedIndex]) {
        goTo(results[selectedIndex].href);
      } else if (query.trim()) {
        goTo(`/search?q=${encodeURIComponent(query.trim())}`);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setSelectedIndex(-1);
      inputRef.current?.blur();
    }
  };

  return (
    <div
      ref={containerRef}
      className={`relative ${className ?? ""}`}
      {...props}
    >
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 select-none text-muted-foreground" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (results.length > 0 && query.length > 0) setOpen(true);
          }}
          placeholder="Buscar recordatorios..."
          className="h-10 w-full rounded-none border border-input bg-background pl-9 pr-4 text-sm text-foreground outline-none focus:border-primary placeholder:text-muted-foreground"
        />
      </div>

      {open && (results.length > 0 || query.trim()) && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-80 overflow-y-auto border border-border bg-popover shadow-lg">
          {results.map((r, i) => (
            <button
              key={r.id}
              type="button"
              className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-accent ${
                i === selectedIndex ? "bg-accent" : ""
              }`}
              onMouseDown={(e) => {
                e.preventDefault();
                goTo(r.href);
              }}
              onMouseEnter={() => setSelectedIndex(i)}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {r.subject || "(sin asunto)"}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {r.recipient || "(sin destinatario)"}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span
                  className={`px-1.5 py-0.5 text-[10px] font-medium ${STATUS_CLS[r.status] ?? "bg-muted text-muted-foreground"}`}
                >
                  {STATUS_LABEL[r.status] ?? r.status}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {formatDate(r)}
                </span>
              </div>
            </button>
          ))}

          {query.trim() && (
            <button
              type="button"
              className="flex w-full items-center gap-2 border-t border-border px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              onMouseDown={(e) => {
                e.preventDefault();
                goTo(`/search?q=${encodeURIComponent(query.trim())}`);
              }}
            >
              <SearchIcon className="size-3.5 shrink-0" />
              <span className="truncate">
                Ver todos los resultados de{" "}
                <span className="font-medium text-foreground">"{query}"</span>
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
