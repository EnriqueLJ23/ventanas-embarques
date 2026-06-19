import { Link } from "react-router";
import type { Route } from "./+types/_root";
import { requireUser } from "~/lib/session.server";
import { prisma } from "~/lib/db.server";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  if (user.role === "ADMINISTRADOR") {
    const [scheduled, inProgress, completed, delayed] = await Promise.all([
      prisma.window.count({ where: { scheduledStart: { gte: todayStart, lte: todayEnd }, status: "SCHEDULED" } }),
      prisma.window.count({ where: { scheduledStart: { gte: todayStart, lte: todayEnd }, status: "IN_PROGRESS" } }),
      prisma.window.count({ where: { scheduledStart: { gte: todayStart, lte: todayEnd }, status: "COMPLETED" } }),
      prisma.window.count({ where: { scheduledStart: { gte: todayStart, lte: todayEnd }, delayReason: { not: null } } }),
    ]);
    return { role: user.role, metrics: { scheduled, inProgress, completed, delayed } };
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

export default function Index({ loaderData }: Route.ComponentProps) {
  if (loaderData.role === "ADMINISTRADOR") {
    const { metrics } = loaderData;
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Panel de administración</h1>
        <div className="grid grid-cols-4 gap-4">
          <Card>
            <CardHeader><CardTitle>Programadas</CardTitle></CardHeader>
            <CardContent className="text-3xl font-bold">{metrics.scheduled}</CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>En curso</CardTitle></CardHeader>
            <CardContent className="text-3xl font-bold">{metrics.inProgress}</CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Completadas</CardTitle></CardHeader>
            <CardContent className="text-3xl font-bold">{metrics.completed}</CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Con retraso</CardTitle></CardHeader>
            <CardContent className="text-3xl font-bold">{metrics.delayed}</CardContent>
          </Card>
        </div>
        <Button asChild><Link to="/calendar">Ver calendario</Link></Button>
      </div>
    );
  }

  if (loaderData.role === "CARGA" || loaderData.role === "DESCARGA") {
    const { windows } = loaderData;
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Ventanas de hoy</h1>
        <div className="space-y-2">
          {windows.length === 0 && <p className="text-muted-foreground">Sin ventanas programadas hoy.</p>}
          {windows.map((w) => (
            <Card key={w.id}>
              <CardContent className="flex justify-between items-center pt-6">
                <div>
                  <p className="font-medium">{w.client.name} — {w.warehouse.name}</p>
                  <p className="text-sm text-muted-foreground">{w.operatorName} · {w.licensePlate}</p>
                </div>
                <Button asChild variant="outline"><Link to={`/windows/${w.id}`}>Ver</Link></Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Bienvenido</h1>
      <p className="text-muted-foreground">Ya tienes sesión iniciada.</p>
      <div className="flex gap-2">
        <Button asChild><Link to="/windows/new">Nueva ventana</Link></Button>
        <Button asChild variant="outline"><Link to="/calendar">Ver calendario</Link></Button>
      </div>
    </div>
  );
}
