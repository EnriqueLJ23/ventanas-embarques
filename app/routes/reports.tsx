import { useEffect, useState } from "react";
import type { Route } from "./+types/reports";
import { requireUser } from "~/lib/session.server";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { format, subDays } from "date-fns";

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request, ["ADMINISTRADOR"]);
  return {};
}

export default function Reports() {
  const [from, setFrom] = useState(format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [summary, setSummary] = useState<any>(null);

  useEffect(() => {
    fetch(`/api/reports/summary?from=${from}&to=${to}`)
      .then((r) => r.json())
      .then(setSummary);
  }, [from, to]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Reportes</h1>
      <div className="flex gap-3 items-end">
        <div className="space-y-1">
          <Label htmlFor="from">Desde</Label>
          <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="to">Hasta</Label>
          <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <Button asChild>
          <a href={`/api/reports/export?from=${from}&to=${to}`}>Exportar a Excel</a>
        </Button>
      </div>

      {summary && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Promedio real (min)</TableHead>
              <TableHead>Promedio estimado (min)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {summary.avgByClient.map((row: any) => (
              <TableRow key={row.clientName}>
                <TableCell>{row.clientName}</TableCell>
                <TableCell>{row.avgActualMinutes ?? "—"}</TableCell>
                <TableCell>{row.avgEstimatedMinutes}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
