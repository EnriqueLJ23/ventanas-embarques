import { useNavigate } from "react-router";
import type { Route } from "./+types/overrides";
import { requireUser } from "~/lib/session.server";
import { prisma } from "~/lib/db.server";
import { Button } from "~/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { toast } from "sonner";
import { format } from "date-fns";
import { PageHeader } from "~/components/layout/PageHeader";
import { EmptyState } from "~/components/layout/EmptyState";
import { TableCard } from "~/components/layout/TableCard";
import { Card, CardContent } from "~/components/ui/card";
import { ClipboardCheck } from "lucide-react";

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request, ["ADMINISTRADOR"]);
  const overrides = await prisma.overrideRequest.findMany({
    where: { status: "PENDING" },
    include: { window: { include: { client: true, warehouse: true } } },
    orderBy: { createdAt: "desc" },
  });
  return { overrides };
}

export default function OverridesAdmin({ loaderData }: Route.ComponentProps) {
  const { overrides } = loaderData;
  const navigate = useNavigate();

  async function review(id: string, status: "APPROVED" | "REJECTED") {
    const res = await fetch(`/api/overrides/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      toast.error("No se pudo procesar la solicitud");
      return;
    }
    toast.success(status === "APPROVED" ? "Solicitud aprobada" : "Solicitud rechazada");
    navigate(".", { replace: true });
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Excepciones"
        description="Solicitudes de excepción a la validación de solapamiento, pendientes de revisión."
      />
      {overrides.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState message="No hay solicitudes pendientes." icon={ClipboardCheck} />
          </CardContent>
        </Card>
      ) : (
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Cliente</TableHead>
                <TableHead>Nave</TableHead>
                <TableHead>Horario</TableHead>
                <TableHead>Motivo</TableHead>
                <TableHead className="pr-4"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {overrides.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="pl-4 font-medium">{o.window.client.name}</TableCell>
                  <TableCell>{o.window.warehouse.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {format(new Date(o.window.scheduledStart), "dd/MM HH:mm")} -{" "}
                    {format(new Date(o.window.scheduledEnd), "HH:mm")}
                  </TableCell>
                  <TableCell>{o.reason}</TableCell>
                  <TableCell className="pr-4 flex gap-2">
                    <Button size="sm" onClick={() => review(o.id, "APPROVED")}>
                      Aprobar
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => review(o.id, "REJECTED")}>
                      Rechazar
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableCard>
      )}
    </div>
  );
}
