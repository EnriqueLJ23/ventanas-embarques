import { useState } from "react";
import { useNavigate } from "react-router";
import type { Route } from "./+types/delay-reasons";
import { requireUser } from "~/lib/session.server";
import { prisma } from "~/lib/db.server";
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
import { Badge } from "~/components/ui/badge";
import { PageHeader } from "~/components/layout/PageHeader";
import { EmptyState } from "~/components/layout/EmptyState";
import { TableCard } from "~/components/layout/TableCard";
import { Card, CardContent } from "~/components/ui/card";
import { CrudFormDialog } from "~/components/admin/CrudFormDialog";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import type { DelayReason } from "@prisma/client";

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request, ["ADMINISTRADOR"]);
  const reasons = await prisma.delayReason.findMany({ orderBy: { label: "asc" } });
  return { reasons };
}

export default function DelayReasonsAdmin({ loaderData }: Route.ComponentProps) {
  const { reasons } = loaderData;
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<DelayReason | null>(null);
  const [label, setLabel] = useState("");
  const [editLabel, setEditLabel] = useState("");

  function openEdit(r: DelayReason) {
    setEditTarget(r);
    setEditLabel(r.label);
  }

  async function handleCreate() {
    const res = await fetch("/api/delay-reasons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label }),
    });
    if (!res.ok) { toast.error("No se pudo crear el motivo"); return; }
    toast.success("Motivo creado");
    setCreateOpen(false);
    setLabel("");
    navigate(".", { replace: true });
  }

  async function handleEdit() {
    if (!editTarget) return;
    const res = await fetch("/api/delay-reasons", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editTarget.id, label: editLabel }),
    });
    if (!res.ok) { toast.error("No se pudo actualizar el motivo"); return; }
    toast.success("Motivo actualizado");
    setEditTarget(null);
    navigate(".", { replace: true });
  }

  async function toggleActive(r: DelayReason) {
    const res = await fetch("/api/delay-reasons", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: r.id, active: !r.active }),
    });
    if (!res.ok) { toast.error("No se pudo actualizar el motivo"); return; }
    navigate(".", { replace: true });
  }

  return (
    <div className="space-y-4">
      <PageHeader
        action={
          <CrudFormDialog
            trigger={<Button>Nuevo motivo</Button>}
            title="Nuevo motivo"
            open={createOpen}
            onOpenChange={setCreateOpen}
            onSave={handleCreate}
            saveDisabled={!label}
          >
            <div className="space-y-1">
              <Label htmlFor="label">Motivo</Label>
              <Input id="label" value={label} onChange={(e) => setLabel(e.target.value)} />
            </div>
          </CrudFormDialog>
        }
      />

      <CrudFormDialog
        title="Editar motivo"
        open={!!editTarget}
        onOpenChange={(o) => !o && setEditTarget(null)}
        onSave={handleEdit}
        saveDisabled={!editLabel}
      >
        <div className="space-y-1">
          <Label htmlFor="editLabel">Motivo</Label>
          <Input id="editLabel" value={editLabel} onChange={(e) => setEditLabel(e.target.value)} />
        </div>
      </CrudFormDialog>

      {reasons.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState message="No hay motivos configurados todavía." icon={AlertTriangle} />
          </CardContent>
        </Card>
      ) : (
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Motivo</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="pr-4"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reasons.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="pl-4 font-medium">{r.label}</TableCell>
                  <TableCell>
                    <Badge variant={r.active ? "success" : "secondary"}>
                      {r.active ? "Activo" : "Inactivo"}
                    </Badge>
                  </TableCell>
                  <TableCell className="pr-4">
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => openEdit(r)}>
                        Editar
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => toggleActive(r)}>
                        {r.active ? "Desactivar" : "Activar"}
                      </Button>
                    </div>
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
