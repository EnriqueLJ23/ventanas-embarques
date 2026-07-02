import type { Route } from "./+types/activity";
import { requireUser } from "~/lib/session.server";
import { prisma } from "~/lib/db.server";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { format } from "date-fns";
import { PageHeader } from "~/components/layout/PageHeader";
import { EmptyState } from "~/components/layout/EmptyState";
import { TableCard } from "~/components/layout/TableCard";
import { Card, CardContent } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { History } from "lucide-react";

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request, ["ADMINISTRADOR"]);
  const logs = await prisma.activityLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const userIds = [...new Set(logs.map((l) => l.userId))];
  const users = await prisma.user.findMany({ where: { id: { in: userIds } } });
  const userMap = new Map(users.map((u) => [u.id, u.name]));
  return {
    logs: logs.map((l) => ({ ...l, userName: userMap.get(l.userId) ?? `Usuario ${l.userId}` })),
  };
}

export default function ActivityAdmin({ loaderData }: Route.ComponentProps) {
  const { logs } = loaderData;
  return (
    <div className="space-y-4">
      <PageHeader title="Historial de actividad" description="Últimas 200 acciones registradas en el sistema." />
      {logs.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState message="No hay actividad registrada todavía." icon={History} />
          </CardContent>
        </Card>
      ) : (
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Fecha</TableHead>
                <TableHead>Usuario</TableHead>
                <TableHead>Acción</TableHead>
                <TableHead>Entidad</TableHead>
                <TableHead className="pr-4">Detalle</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="pl-4 text-muted-foreground">
                    {format(new Date(l.createdAt), "dd/MM/yyyy HH:mm")}
                  </TableCell>
                  <TableCell className="font-medium">{l.userName}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{l.action}</Badge>
                  </TableCell>
                  <TableCell>{l.entity}</TableCell>
                  <TableCell className="pr-4 text-muted-foreground">{l.detail}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableCard>
      )}
    </div>
  );
}
