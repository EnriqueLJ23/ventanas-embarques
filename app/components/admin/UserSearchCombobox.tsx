import { useEffect, useRef, useState } from "react";
import { Input } from "~/components/ui/input";

interface DirectoryUser {
  name: string;
  email: string;
}

export function UserSearchCombobox({
  onSelect,
}: {
  onSelect: (user: DirectoryUser) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DirectoryUser[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        setResults(data.results ?? []);
        setUnavailable(data.error === "graph_unavailable");
        setOpen(true);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <Input
        placeholder="Buscar por nombre o correo en el directorio..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
      />
      {open && (
        <div className="absolute z-50 mt-1 w-80 max-w-full rounded-lg bg-popover p-1 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10">
          {loading && <p className="px-2 py-1.5 text-sm text-muted-foreground">Buscando...</p>}
          {!loading && unavailable && (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">
              No se pudo consultar el directorio. Ingresa los datos manualmente.
            </p>
          )}
          {!loading && !unavailable && results.length === 0 && (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">Sin resultados.</p>
          )}
          {!loading &&
            results.map((u) => (
              <button
                key={u.email}
                type="button"
                className="block w-full cursor-pointer rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
                onClick={() => {
                  onSelect(u);
                  setOpen(false);
                }}
              >
                <span className="font-medium">{u.name}</span>
                <span className="block text-xs text-muted-foreground">{u.email}</span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
