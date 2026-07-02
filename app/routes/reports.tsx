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
import { PageHeader } from "~/components/layout/PageHeader";
import { EmptyState } from "~/components/layout/EmptyState";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { TableCard } from "~/components/layout/TableCard";
import {
  FileSpreadsheet,
  FileBarChart,
  CalendarRange,
  CheckCircle2,
  Clock3,
  TimerReset,
  TrendingUp,
  Package,
  Warehouse,
} from "lucide-react";

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
      <PageHeader
        title="Reportes"
        description="Tiempos reales vs. estimados por cliente en el rango seleccionado."
        action={
          <Button asChild>
            <a href={`/api/reports/export?from=${from}&to=${to}`}>
              <FileSpreadsheet className="size-4" />
              Exportar a Excel
            </a>
          </Button>
        }
      />

      <Card>
        <CardContent className="pt-6 flex gap-3 items-end">
          <div className="space-y-1">
            <Label htmlFor="from">Desde</Label>
            <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="to">Hasta</Label>
            <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {summary && (
        <>
          <div className="space-y-2">
            <h2 className="text-lg font-semibold">Puntualidad</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Citas programadas</CardTitle>
                  <CalendarRange className="size-4 text-muted-foreground" />
                </CardHeader>
                <CardContent className="text-3xl font-bold">{summary.puntualidad.citasProgramadas}</CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Citas atendidas</CardTitle>
                  <CheckCircle2 className="size-4 text-muted-foreground" />
                </CardHeader>
                <CardContent className="text-3xl font-bold">{summary.puntualidad.citasAtendidas}</CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Llegadas puntuales</CardTitle>
                  <Clock3 className="size-4 text-muted-foreground" />
                </CardHeader>
                <CardContent className="text-3xl font-bold">{summary.puntualidad.llegadasPuntuales}</CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Llegadas tardías</CardTitle>
                  <TimerReset className="size-4 text-muted-foreground" />
                </CardHeader>
                <CardContent className="text-3xl font-bold">{summary.puntualidad.llegadasTardias}</CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">% Cumplimiento</CardTitle>
                  <TrendingUp className="size-4 text-muted-foreground" />
                </CardHeader>
                <CardContent className="text-3xl font-bold">{summary.puntualidad.porcentajeCumplimiento}%</CardContent>
              </Card>
            </div>
          </div>

          <div className="space-y-2">
            <h2 className="text-lg font-semibold">Operación</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Cargas realizadas</CardTitle>
                  <Package className="size-4 text-muted-foreground" />
                </CardHeader>
                <CardContent className="text-3xl font-bold">{summary.operacion.cargasRealizadas}</CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Descargas realizadas</CardTitle>
                  <Package className="size-4 text-muted-foreground" />
                </CardHeader>
                <CardContent className="text-3xl font-bold">{summary.operacion.descargasRealizadas}</CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Unidades en planta</CardTitle>
                  <Warehouse className="size-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold">{summary.operacion.unidadesEnPlanta}</p>
                  <p className="text-xs text-muted-foreground">ahora mismo</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Unidades pendientes</CardTitle>
                  <Warehouse className="size-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold">{summary.operacion.unidadesPendientes}</p>
                  <p className="text-xs text-muted-foreground">ahora mismo</p>
                </CardContent>
              </Card>
            </div>
          </div>

          <div className="space-y-2">
            <h2 className="text-lg font-semibold">Tiempo</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Espera promedio</CardTitle>
                  <Clock3 className="size-4 text-muted-foreground" />
                </CardHeader>
                <CardContent className="text-3xl font-bold">
                  {summary.tiempo.tiempoPromedioEspera != null ? `${summary.tiempo.tiempoPromedioEspera} min` : "—"}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Carga promedio</CardTitle>
                  <Clock3 className="size-4 text-muted-foreground" />
                </CardHeader>
                <CardContent className="text-3xl font-bold">
                  {summary.tiempo.tiempoPromedioCarga != null ? `${summary.tiempo.tiempoPromedioCarga} min` : "—"}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Descarga promedio</CardTitle>
                  <Clock3 className="size-4 text-muted-foreground" />
                </CardHeader>
                <CardContent className="text-3xl font-bold">
                  {summary.tiempo.tiempoPromedioDescarga != null ? `${summary.tiempo.tiempoPromedioDescarga} min` : "—"}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Total en planta</CardTitle>
                  <Clock3 className="size-4 text-muted-foreground" />
                </CardHeader>
                <CardContent className="text-3xl font-bold">
                  {summary.tiempo.tiempoPromedioTotalEnPlanta != null ? `${summary.tiempo.tiempoPromedioTotalEnPlanta} min` : "—"}
                </CardContent>
              </Card>
            </div>
          </div>

          <div className="space-y-2">
            <h2 className="text-lg font-semibold">Retrasos</h2>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <TableCard>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-4">Motivo</TableHead>
                      <TableHead className="pr-4">Conteo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summary.retrasos.porMotivo.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={2} className="text-muted-foreground pl-4">
                          Sin retrasos con motivo registrado.
                        </TableCell>
                      </TableRow>
                    )}
                    {summary.retrasos.porMotivo.map((row: any) => (
                      <TableRow key={row.category}>
                        <TableCell className="pl-4">{row.label}</TableCell>
                        <TableCell className="pr-4">{row.count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableCard>

              <TableCard>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-4">Transportista más puntual</TableHead>
                      <TableHead className="pr-4">% Puntualidad</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summary.retrasos.masPuntuales.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={2} className="text-muted-foreground pl-4">
                          Sin datos en el rango.
                        </TableCell>
                      </TableRow>
                    )}
                    {summary.retrasos.masPuntuales.map((row: any) => (
                      <TableRow key={row.clientName}>
                        <TableCell className="pl-4">{row.clientName}</TableCell>
                        <TableCell className="pr-4">{row.porcentajePuntual}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableCard>

              <TableCard>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-4">Con más incidencias</TableHead>
                      <TableHead className="pr-4">Conteo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summary.retrasos.masIncidencias.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={2} className="text-muted-foreground pl-4">
                          Sin incidencias en el rango.
                        </TableCell>
                      </TableRow>
                    )}
                    {summary.retrasos.masIncidencias.map((row: any) => (
                      <TableRow key={row.clientName}>
                        <TableCell className="pl-4">{row.clientName}</TableCell>
                        <TableCell className="pr-4">{row.count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableCard>
            </div>
          </div>
        </>
      )}

      {summary && summary.avgByClient.length === 0 && (
        <Card>
          <CardContent>
            <EmptyState message="No hay ventanas en el rango seleccionado." icon={FileBarChart} />
          </CardContent>
        </Card>
      )}

      {summary && summary.avgByClient.length > 0 && (
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Cliente</TableHead>
                <TableHead>Promedio real (min)</TableHead>
                <TableHead className="pr-4">Promedio estimado (min)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summary.avgByClient.map((row: any) => (
                <TableRow key={row.clientName}>
                  <TableCell className="pl-4 font-medium">{row.clientName}</TableCell>
                  <TableCell>{row.avgActualMinutes ?? "—"}</TableCell>
                  <TableCell className="pr-4 text-muted-foreground">{row.avgEstimatedMinutes}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableCard>
      )}
    </div>
  );
}
