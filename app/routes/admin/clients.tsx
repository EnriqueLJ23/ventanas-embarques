import { useState } from "react";
import { useNavigate } from "react-router";
import type { Route } from "./+types/clients";
import { requireUser } from "~/lib/session.server";
import { prisma } from "~/lib/db.server";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
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
  DialogTrigger,
} from "~/components/ui/dialog";
import { Badge } from "~/components/ui/badge";
import { PageHeader } from "~/components/layout/PageHeader";
import { EmptyState } from "~/components/layout/EmptyState";
import { TableCard } from "~/components/layout/TableCard";
import { Card, CardContent } from "~/components/ui/card";
import { Users } from "lucide-react";
import { toast } from "sonner";
import type { Client } from "@prisma/client";

type ClientWithRefs = Client & { preferredWarehouseRef: { id: string; name: string } | null };

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request, ["ADMINISTRADOR"]);
  const [clients, warehouses] = await Promise.all([
    prisma.client.findMany({ include: { preferredWarehouseRef: true }, orderBy: { name: "asc" } }),
    prisma.warehouse.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);
  return { clients, warehouses };
}

function ClientForm({
  warehouses,
  initial,
  onSave,
  onCancel,
}: {
  warehouses: { id: string; name: string }[];
  initial?: Partial<ClientWithRefs>;
  onSave: (data: Record<string, string>) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [avgLoadTime, setAvgLoadTime] = useState(String(initial?.avgLoadTime ?? ""));
  const [preferredWarehouseId, setPreferredWarehouseId] = useState(initial?.preferredWarehouseId ?? "");
  const [defaultArrivalTime, setDefaultArrivalTime] = useState(initial?.defaultArrivalTime ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    await onSave({ name, avgLoadTime, preferredWarehouseId, defaultArrivalTime });
    setSaving(false);
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor="name">Nombre</Label>
        <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="avgLoadTime">Tiempo promedio (minutos)</Label>
        <Input
          id="avgLoadTime"
          type="number"
          value={avgLoadTime}
          onChange={(e) => setAvgLoadTime(e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label>Nave preferida</Label>
        <Select
          value={preferredWarehouseId || "__none__"}
          onValueChange={(v) => setPreferredWarehouseId(v === "__none__" ? "" : v)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Sin preferencia" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">Sin preferencia</SelectItem>
            {warehouses.map((w) => (
              <SelectItem key={w.id} value={w.id}>
                {w.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="defaultArrivalTime">Hora habitual de llegada</Label>
        <Input
          id="defaultArrivalTime"
          type="time"
          value={defaultArrivalTime}
          onChange={(e) => setDefaultArrivalTime(e.target.value)}
        />
      </div>
      <div className="flex gap-2 pt-1">
        <Button onClick={handleSave} disabled={!name || !avgLoadTime || saving}>
          Guardar
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

export default function ClientsAdmin({ loaderData }: Route.ComponentProps) {
  const { clients, warehouses } = loaderData;
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ClientWithRefs | null>(null);

  async function handleCreate(data: Record<string, string>) {
    const res = await fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) { toast.error("No se pudo crear el cliente"); return; }
    toast.success("Cliente creado");
    setCreateOpen(false);
    navigate(".", { replace: true });
  }

  async function handleEdit(data: Record<string, string>) {
    if (!editTarget) return;
    const res = await fetch("/api/clients", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editTarget.id, ...data }),
    });
    if (!res.ok) { toast.error("No se pudo actualizar el cliente"); return; }
    toast.success("Cliente actualizado");
    setEditTarget(null);
    navigate(".", { replace: true });
  }

  async function toggleActive(client: ClientWithRefs) {
    const res = await fetch("/api/clients", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: client.id, active: !client.active }),
    });
    if (!res.ok) { toast.error("No se pudo actualizar el cliente"); return; }
    navigate(".", { replace: true });
  }

  return (
    <div className="space-y-4">
      <PageHeader
        action={
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button>Nuevo cliente</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nuevo cliente</DialogTitle>
              </DialogHeader>
              <ClientForm
                warehouses={warehouses}
                onSave={handleCreate}
                onCancel={() => setCreateOpen(false)}
              />
            </DialogContent>
          </Dialog>
        }
      />

      {/* Edit dialog */}
      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar cliente</DialogTitle>
          </DialogHeader>
          {editTarget && (
            <ClientForm
              warehouses={warehouses}
              initial={editTarget}
              onSave={handleEdit}
              onCancel={() => setEditTarget(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {clients.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState message="No hay clientes registrados todavía." icon={Users} />
          </CardContent>
        </Card>
      ) : (
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Nombre</TableHead>
                <TableHead>T. promedio</TableHead>
                <TableHead>Nave pref.</TableHead>
                <TableHead>Llegada habitual</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="pr-4"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clients.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="pl-4 font-medium">{c.name}</TableCell>
                  <TableCell>{c.avgLoadTime} min</TableCell>
                  <TableCell className="text-muted-foreground">
                    {c.preferredWarehouseRef?.name ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {c.defaultArrivalTime ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={c.active ? "success" : "secondary"}>
                      {c.active ? "Activo" : "Inactivo"}
                    </Badge>
                  </TableCell>
                  <TableCell className="pr-4">
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => setEditTarget(c as ClientWithRefs)}>
                        Editar
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleActive(c as ClientWithRefs)}
                      >
                        {c.active ? "Desactivar" : "Activar"}
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
