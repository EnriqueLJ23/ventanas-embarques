import { useState } from "react";
import { useNavigate } from "react-router";
import type { Route } from "./+types/warehouses";
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
import { CrudFormDialog } from "~/components/admin/CrudFormDialog";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent } from "~/components/ui/card";
import { PageHeader } from "~/components/layout/PageHeader";
import { EmptyState } from "~/components/layout/EmptyState";
import { TableCard } from "~/components/layout/TableCard";
import { Warehouse } from "lucide-react";
import { toast } from "sonner";
import type { Warehouse as WarehouseModel } from "@prisma/client";

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request, ["ADMINISTRADOR"]);
  const warehouses = await prisma.warehouse.findMany({ orderBy: { name: "asc" } });
  return { warehouses };
}

export default function WarehousesAdmin({ loaderData }: Route.ComponentProps) {
  const { warehouses } = loaderData;
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<WarehouseModel | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [editName, setEditName] = useState("");
  const [editCode, setEditCode] = useState("");

  function openEdit(w: WarehouseModel) {
    setEditTarget(w);
    setEditName(w.name);
    setEditCode(w.code);
  }

  async function handleCreate() {
    const res = await fetch("/api/warehouses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, code }),
    });
    if (!res.ok) { toast.error("No se pudo crear la nave"); return; }
    toast.success("Nave creada");
    setCreateOpen(false);
    setName("");
    setCode("");
    navigate(".", { replace: true });
  }

  async function handleEdit() {
    if (!editTarget) return;
    const res = await fetch("/api/warehouses", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editTarget.id, name: editName, code: editCode }),
    });
    if (!res.ok) { toast.error("No se pudo actualizar la nave"); return; }
    toast.success("Nave actualizada");
    setEditTarget(null);
    navigate(".", { replace: true });
  }

  async function toggleActive(w: WarehouseModel) {
    const res = await fetch("/api/warehouses", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: w.id, active: !w.active }),
    });
    if (!res.ok) { toast.error("No se pudo actualizar la nave"); return; }
    navigate(".", { replace: true });
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Naves"
        description="Almacenes disponibles para programar ventanas de embarque."
        action={
          <CrudFormDialog
            trigger={<Button>Nueva nave</Button>}
            title="Nueva nave"
            open={createOpen}
            onOpenChange={setCreateOpen}
            onSave={handleCreate}
            saveDisabled={!name || !code}
          >
            <div className="space-y-1">
              <Label htmlFor="name">Nombre</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="code">Código</Label>
              <Input id="code" value={code} onChange={(e) => setCode(e.target.value)} />
            </div>
          </CrudFormDialog>
        }
      />

      {/* Edit dialog */}
      <CrudFormDialog
        title="Editar nave"
        open={!!editTarget}
        onOpenChange={(o) => !o && setEditTarget(null)}
        onSave={handleEdit}
        saveDisabled={!editName || !editCode}
      >
        <div className="space-y-1">
          <Label htmlFor="editName">Nombre</Label>
          <Input id="editName" value={editName} onChange={(e) => setEditName(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="editCode">Código</Label>
          <Input id="editCode" value={editCode} onChange={(e) => setEditCode(e.target.value)} />
        </div>
      </CrudFormDialog>

      {warehouses.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState message="No hay naves registradas todavía." icon={Warehouse} />
          </CardContent>
        </Card>
      ) : (
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Nombre</TableHead>
                <TableHead>Código</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="pr-4"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {warehouses.map((w) => (
                <TableRow key={w.id}>
                  <TableCell className="pl-4 font-medium">{w.name}</TableCell>
                  <TableCell>{w.code}</TableCell>
                  <TableCell>
                    <Badge variant={w.active ? "success" : "secondary"}>
                      {w.active ? "Activa" : "Inactiva"}
                    </Badge>
                  </TableCell>
                  <TableCell className="pr-4">
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => openEdit(w)}>
                        Editar
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => toggleActive(w)}>
                        {w.active ? "Desactivar" : "Activar"}
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
