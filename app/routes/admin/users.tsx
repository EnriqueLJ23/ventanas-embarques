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
import { Badge } from "~/components/ui/badge";
import { PageHeader } from "~/components/layout/PageHeader";
import { EmptyState } from "~/components/layout/EmptyState";
import { TableCard } from "~/components/layout/TableCard";
import { Card, CardContent } from "~/components/ui/card";
import { CrudFormDialog } from "~/components/admin/CrudFormDialog";
import { UserSearchCombobox } from "~/components/admin/UserSearchCombobox";
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
  const [manualEntry, setManualEntry] = useState(false);

  // Edit form state
  const [editRole, setEditRole] = useState<string>("VENTAS");

  function openEdit(u: User) {
    setEditTarget(u);
    setEditRole(u.role);
  }

  function resetCreateForm() {
    setEmail("");
    setName("");
    setRole("VENTAS");
    setManualEntry(false);
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
    resetCreateForm();
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
        description="Cuentas con acceso al sistema y su rol asignado. Solo el administrador puede crear cuentas."
        action={
          <CrudFormDialog
            trigger={<Button>Nuevo usuario</Button>}
            title="Nuevo usuario"
            open={createOpen}
            onOpenChange={(o) => { setCreateOpen(o); if (!o) resetCreateForm(); }}
            onSave={handleCreate}
            saveDisabled={!email || !name}
          >
            {!manualEntry ? (
              <div className="space-y-2">
                <Label>Buscar en el directorio</Label>
                <UserSearchCombobox
                  onSelect={(u) => { setName(u.name); setEmail(u.email); }}
                />
                {(name || email) && (
                  <div className="rounded-md border p-2 text-sm">
                    <p className="font-medium">{name}</p>
                    <p className="text-muted-foreground">{email}</p>
                  </div>
                )}
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline"
                  onClick={() => setManualEntry(true)}
                >
                  Ingresar datos manualmente
                </button>
              </div>
            ) : (
              <>
                <div className="space-y-1">
                  <Label htmlFor="email">Correo</Label>
                  <Input id="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="uname">Nombre</Label>
                  <Input id="uname" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline"
                  onClick={() => setManualEntry(false)}
                >
                  Volver a la búsqueda del directorio
                </button>
              </>
            )}
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
          </CrudFormDialog>
        }
      />

      <CrudFormDialog
        title="Editar usuario"
        open={!!editTarget}
        onOpenChange={(o) => !o && setEditTarget(null)}
        onSave={handleEditSave}
      >
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
      </CrudFormDialog>

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
