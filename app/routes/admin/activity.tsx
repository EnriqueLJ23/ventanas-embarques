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
      <h2 className="text-xl font-semibold">Historial de actividad</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fecha</TableHead>
            <TableHead>Usuario</TableHead>
            <TableHead>Acción</TableHead>
            <TableHead>Entidad</TableHead>
            <TableHead>Detalle</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map((l) => (
            <TableRow key={l.id}>
              <TableCell>{format(new Date(l.createdAt), "dd/MM/yyyy HH:mm")}</TableCell>
              <TableCell>{l.userName}</TableCell>
              <TableCell>{l.action}</TableCell>
              <TableCell>{l.entity}</TableCell>
              <TableCell>{l.detail}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
