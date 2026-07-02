import { useState } from "react";
import { useNavigate } from "react-router";
import type { Route } from "./+types/users";
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
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import type { User } from "@prisma/client";

const ROLES = ["VENTAS", "CARGA", "DESCARGA", "ADMINISTRADOR"] as const;

const ROLE_LABELS: Record<string, string> = {
  VENTAS: "Ventas",
  CARGA: "Carga",
  DESCARGA: "Descarga",
  ADMINISTRADOR: "Administrador",
};

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request, ["ADMINISTRADOR"]);
  const users = await prisma.user.findMany({ orderBy: { name: "asc" } });
  return { users };
}

export default function UsersAdmin({ loaderData }: Route.ComponentProps) {
  const { users } = loaderData;
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<User | null>(null);

  // Create form state
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<string>("VENTAS");

  // Edit form state
  const [editRole, setEditRole] = useState<string>("VENTAS");

  function openEdit(u: User) {
    setEditTarget(u);
    setEditRole(u.role);
  }

  async function handleCreate() {
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name, role }),
    });
    if (!res.ok) { toast.error("No se pudo crear el usuario"); return; }
    toast.success("Usuario creado");
    setCreateOpen(false);
    setEmail(""); setName(""); setRole("VENTAS");
    navigate(".", { replace: true });
  }

  async function handleEditSave() {
    if (!editTarget) return;
    const res = await fetch("/api/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editTarget.id, role: editRole }),
    });
    if (!res.ok) { toast.error("No se pudo actualizar el usuario"); return; }
    toast.success("Rol actualizado");
    setEditTarget(null);
    navigate(".", { replace: true });
  }

  async function toggleActive(u: User) {
    const res = await fetch("/api/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: u.id, active: !u.active }),
    });
    if (!res.ok) { toast.error("No se pudo actualizar el usuario"); return; }
    navigate(".", { replace: true });
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Usuarios"
        description="Cuentas con acceso al sistema y su rol asignado."
        action={
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button>Nuevo usuario</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nuevo usuario</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="email">Correo</Label>
                  <Input id="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="uname">Nombre</Label>
                  <Input id="uname" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Rol</Label>
                  <Select value={role} onValueChange={setRole}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => (
                        <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleCreate} disabled={!email || !name}>Guardar</Button>
                  <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancelar</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        }
      />

      {/* Edit role dialog */}
      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar usuario</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {editTarget?.name} — {editTarget?.email}
            </p>
            <div className="space-y-1">
              <Label>Rol</Label>
              <Select value={editRole} onValueChange={setEditRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleEditSave}>Guardar</Button>
              <Button variant="ghost" onClick={() => setEditTarget(null)}>Cancelar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {users.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState message="No hay usuarios registrados todavía." icon={ShieldCheck} />
          </CardContent>
        </Card>
      ) : (
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Nombre</TableHead>
                <TableHead>Correo</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="pr-4"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="pl-4 font-medium">{u.name}</TableCell>
                  <TableCell className="text-muted-foreground">{u.email}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{ROLE_LABELS[u.role] ?? u.role}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={u.active ? "success" : "secondary"}>
                      {u.active ? "Activo" : "Inactivo"}
                    </Badge>
                  </TableCell>
                  <TableCell className="pr-4">
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => openEdit(u)}>
                        Editar rol
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => toggleActive(u)}>
                        {u.active ? "Desactivar" : "Activar"}
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
