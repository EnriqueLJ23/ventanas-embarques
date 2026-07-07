import { Link } from "react-router";
import type { Route } from "./+types/_root";
import { requireUser } from "~/lib/session.server";
import { prisma } from "~/lib/db.server";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { PageHeader } from "~/components/layout/PageHeader";
import {
  CalendarRange,
  Clock3,
  ListChecks,
  TimerReset,
} from "lucide-react";
import { Bar, BarChart, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "~/components/ui/chart";
import { WINDOW_STATUS_BADGE_VARIANT, WINDOW_STATUS_LABEL } from "~/lib/windowStatus";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  if (user.role === "ADMINISTRADOR") {
    const [scheduled, inProgress, completed, delayed, warehouses, todaysWindows, pendingOverrides] =
      await Promise.all([
        prisma.window.count({ where: { scheduledStart: { gte: todayStart, lte: todayEnd }, status: "SCHEDULED" } }),
        prisma.window.count({ where: { scheduledStart: { gte: todayStart, lte: todayEnd }, status: "IN_PROGRESS" } }),
        prisma.window.count({ where: { scheduledStart: { gte: todayStart, lte: todayEnd }, status: "COMPLETED" } }),
        prisma.window.count({ where: { scheduledStart: { gte: todayStart, lte: todayEnd }, delayReasonId: { not: null } } }),
        prisma.warehouse.findMany({ orderBy: { name: "asc" } }),
        prisma.window.findMany({ where: { scheduledStart: { gte: todayStart, lte: todayEnd } }, select: { warehouseId: true } }),
        prisma.overrideRequest.findMany({
          where: { status: "PENDING" },
          orderBy: { createdAt: "desc" },
          take: 5,
          include: { window: { include: { client: true } } },
        }),
      ]);

    const occupancy = warehouses.map((w) => ({
      warehouse: w.name,
      ventanas: todaysWindows.filter((win) => win.warehouseId === w.id).length,
    }));

    return {
      role: user.role,
      metrics: { scheduled, inProgress, completed, delayed },
      occupancy,
      pendingOverrides,
    };
  }

  if (user.role === "CARGA" || user.role === "DESCARGA") {
    const windows = await prisma.window.findMany({
      where: {
        scheduledStart: { gte: todayStart, lte: todayEnd },
        type: user.role === "CARGA" ? "CARGA" : "DESCARGA",
      },
      include: { client: true, warehouse: true },
      orderBy: { scheduledStart: "asc" },
    });
    return { role: user.role, windows };
  }

  return { role: user.role };
}

const occupancyChartConfig = {
  ventanas: { label: "Ventanas hoy", color: "var(--chart-1)" },
} satisfies ChartConfig;

export default function Index({ loaderData }: Route.ComponentProps) {
  const today = format(new Date(), "EEEE d 'de' MMMM", { locale: es });

  if (loaderData.role === "ADMINISTRADOR") {
    const { metrics, occupancy, pendingOverrides } = loaderData;
    return (
      <div className="space-y-6">
        <PageHeader title="Panel de administración" description={today} />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Programadas</CardTitle>
              <CalendarRange className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="text-3xl font-bold">{metrics.scheduled}</CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">En curso</CardTitle>
              <Clock3 className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="text-3xl font-bold">{metrics.inProgress}</CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Completadas</CardTitle>
              <ListChecks className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="text-3xl font-bold">{metrics.completed}</CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Con retraso</CardTitle>
              <TimerReset className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="text-3xl font-bold">{metrics.delayed}</CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Ocupación por nave (hoy)</CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer config={occupancyChartConfig} className="h-[220px] w-full">
                <BarChart accessibilityLayer data={occupancy} layout="vertical" margin={{ left: -20 }}>
                  <XAxis type="number" dataKey="ventanas" hide allowDecimals={false} />
                  <YAxis dataKey="warehouse" type="category" tickLine={false} tickMargin={10} axisLine={false} />
                  <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
                  <Bar dataKey="ventanas" fill="var(--color-ventanas)" radius={5} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Excepciones pendientes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {pendingOverrides.length === 0 && (
                <p className="text-sm text-muted-foreground">No hay solicitudes pendientes.</p>
              )}
              {pendingOverrides.map((o) => (
                <div key={o.id} className="flex items-center justify-between text-sm">
                  <span className="font-medium">{o.window.client.name}</span>
                  <span className="text-muted-foreground">{format(new Date(o.createdAt), "dd/MM HH:mm")}</span>
                </div>
              ))}
              {pendingOverrides.length > 0 && (
                <Button asChild variant="outline" size="sm" className="w-full">
                  <Link to="/admin/overrides">Ver todas</Link>
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (loaderData.role === "CARGA" || loaderData.role === "DESCARGA") {
    const { windows } = loaderData;
    return (
      <div className="space-y-6">
        <PageHeader title="Ventanas de hoy" description={today} />
        <div className="space-y-2">
          {windows.length === 0 && (
            <p className="text-sm text-muted-foreground">Sin ventanas programadas hoy.</p>
          )}
          {windows.map((w) => (
            <Card key={w.id}>
              <CardContent className="flex justify-between items-center pt-6">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold">{w.client.name}</p>
                    <Badge variant={WINDOW_STATUS_BADGE_VARIANT[w.status]}>
                      {WINDOW_STATUS_LABEL[w.status]}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {w.warehouse.name} · {w.operatorName} · {w.licensePlate}
                  </p>
                </div>
                <Button asChild variant="outline"><Link to={`/windows/${w.id}`}>Ver</Link></Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (loaderData.role === "GUARDIA") {
    return (
      <div className="flex min-h-[70vh] items-center justify-center p-4">
        <p className="max-w-sm text-center text-muted-foreground">
          Escanea el código QR de la unidad para registrar su llegada.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Bienvenido" description={today} />
      <div className="max-w-xs">
        <Link to="/calendar">
          <Card className="hover:bg-accent transition-colors">
            <CardContent className="flex items-center gap-3 pt-6">
              <CalendarRange className="size-5 text-primary" />
              <span className="font-medium">Ver calendario</span>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
