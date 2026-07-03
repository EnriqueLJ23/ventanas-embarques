import { useState } from "react";
import { useNavigate } from "react-router";
import type { Route } from "./+types/tiers";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { CrudFormDialog } from "~/components/admin/CrudFormDialog";
import { Badge } from "~/components/ui/badge";
import { PageHeader } from "~/components/layout/PageHeader";
import { EmptyState } from "~/components/layout/EmptyState";
import { TableCard } from "~/components/layout/TableCard";
import { Card, CardContent } from "~/components/ui/card";
import { LayoutGrid } from "lucide-react";
import { toast } from "sonner";
import type { Tier } from "@prisma/client";

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request, ["ADMINISTRADOR"]);
  const tiers = await prisma.tier.findMany({ orderBy: { priority: "asc" } });
  return { tiers };
}

export default function TiersAdmin({ loaderData }: Route.ComponentProps) {
  const { tiers } = loaderData;
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Tier | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Tier | null>(null);

  const [name, setName] = useState("");
  const [priority, setPriority] = useState("");
  const [description, setDescription] = useState("");

  const [editName, setEditName] = useState("");
  const [editPriority, setEditPriority] = useState("");
  const [editDescription, setEditDescription] = useState("");

  function openEdit(t: Tier) {
    setEditTarget(t);
    setEditName(t.name);
    setEditPriority(String(t.priority));
    setEditDescription(t.description ?? "");
  }

  async function handleCreate() {
    const res = await fetch("/api/tiers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, priority: Number(priority), description }),
    });
    if (!res.ok) { toast.error("No se pudo crear el tier"); return; }
    toast.success("Tier creado");
    setCreateOpen(false);
    setName(""); setPriority(""); setDescription("");
    navigate(".", { replace: true });
  }

  async function handleEdit() {
    if (!editTarget) return;
    const res = await fetch("/api/tiers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editTarget.id, name: editName, priority: editPriority, description: editDescription }),
    });
    if (!res.ok) { toast.error("No se pudo actualizar el tier"); return; }
    toast.success("Tier actualizado");
    setEditTarget(null);
    navigate(".", { replace: true });
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const res = await fetch("/api/tiers", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: deleteTarget.id }),
    });
    if (!res.ok) { toast.error("No se pudo eliminar el tier"); return; }
    toast.success("Tier eliminado");
    setDeleteTarget(null);
    navigate(".", { replace: true });
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Tiers"
        description="Niveles de prioridad para clientes. Tier 1 = mayor prioridad."
        action={
          <CrudFormDialog
            trigger={<Button>Nuevo tier</Button>}
            title="Nuevo tier"
            open={createOpen}
            onOpenChange={setCreateOpen}
            onSave={handleCreate}
            saveDisabled={!name || !priority}
          >
            <div className="space-y-1">
              <Label htmlFor="name">Nombre</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="priority">Prioridad (1 = mayor)</Label>
              <Input id="priority" type="number" value={priority} onChange={(e) => setPriority(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="description">Descripción</Label>
              <Input id="description" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
          </CrudFormDialog>
        }
      />

      {/* Edit dialog */}
      <CrudFormDialog
        title="Editar tier"
        open={!!editTarget}
        onOpenChange={(o) => !o && setEditTarget(null)}
        onSave={handleEdit}
        saveDisabled={!editName || !editPriority}
      >
        <div className="space-y-1">
          <Label htmlFor="editName">Nombre</Label>
          <Input id="editName" value={editName} onChange={(e) => setEditName(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="editPriority">Prioridad (1 = mayor)</Label>
          <Input id="editPriority" type="number" value={editPriority} onChange={(e) => setEditPriority(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="editDescription">Descripción</Label>
          <Input id="editDescription" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} />
        </div>
      </CrudFormDialog>

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar tier</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            ¿Eliminar <span className="font-medium text-foreground">{deleteTarget?.name}</span>? Esta acción no se puede deshacer. Los clientes asignados a este tier perderán su referencia.
          </p>
          <div className="flex gap-2 pt-2">
            <Button variant="destructive" onClick={handleDelete}>Eliminar</Button>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
          </div>
        </DialogContent>
      </Dialog>

      {tiers.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState message="No hay tiers configurados todavía." icon={LayoutGrid} />
          </CardContent>
        </Card>
      ) : (
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Nombre</TableHead>
                <TableHead>Prioridad</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead className="pr-4"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tiers.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="pl-4 font-medium">{t.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline">#{t.priority}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{t.description ?? "—"}</TableCell>
                  <TableCell className="pr-4">
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => openEdit(t)}>
                        Editar
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(t)}>
                        Eliminar
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
