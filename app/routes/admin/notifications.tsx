import { useState } from "react";
import { useNavigate } from "react-router";
import type { Route } from "./+types/notifications";
import { requireUser } from "~/lib/session.server";
import { prisma } from "~/lib/db.server";
import { Button } from "~/components/ui/button";
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
import { Checkbox } from "~/components/ui/checkbox";
import { PageHeader } from "~/components/layout/PageHeader";
import { EmptyState } from "~/components/layout/EmptyState";
import { TableCard } from "~/components/layout/TableCard";
import { Card, CardContent } from "~/components/ui/card";
import { CrudFormDialog } from "~/components/admin/CrudFormDialog";
import { Mail } from "lucide-react";
import { toast } from "sonner";
import type { NotificationRecipient } from "@prisma/client";
import { NOTIFICATION_EVENTS, NOTIFICATION_EVENT_LABEL } from "~/lib/notificationEvents";

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request, ["ADMINISTRADOR"]);
  const [recipients, users] = await Promise.all([
    prisma.notificationRecipient.findMany({
      orderBy: [{ event: "asc" }, { user: { name: "asc" } }],
      include: { user: { select: { id: true, name: true, email: true, active: true } } },
    }),
    prisma.user.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true },
    }),
  ]);
  return { recipients, users };
}

export default function NotificationsAdmin({ loaderData }: Route.ComponentProps) {
  const { recipients, users } = loaderData;
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const [events, setEvents] = useState<string[]>([]);
  const [userId, setUserId] = useState("");

  function toggleEvent(event: string, checked: boolean) {
    setEvents((prev) => (checked ? [...prev, event] : prev.filter((e) => e !== event)));
  }

  const [editTarget, setEditTarget] = useState<NotificationRecipient | null>(null);
  const [editEvent, setEditEvent] = useState<string>(NOTIFICATION_EVENTS[0]);
  const [editUserId, setEditUserId] = useState("");

  function openEdit(r: NotificationRecipient) {
    setEditTarget(r);
    setEditEvent(r.event);
    setEditUserId(String(r.userId));
  }

  async function handleEditSave() {
    if (!editTarget) return;
    const res = await fetch("/api/notification-recipients", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editTarget.id, event: editEvent, userId: editUserId }),
    });
    if (!res.ok) { toast.error("No se pudo actualizar el destinatario"); return; }
    toast.success("Destinatario actualizado");
    setEditTarget(null);
    navigate(".", { replace: true });
  }

  async function handleCreate() {
    const res = await fetch("/api/notification-recipients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events, userId }),
    });
    if (!res.ok) { toast.error("No se pudo agregar el destinatario"); return; }
    toast.success(events.length > 1 ? "Destinatario agregado a los eventos seleccionados" : "Destinatario agregado");
    setCreateOpen(false);
    setUserId("");
    setEvents([]);
    navigate(".", { replace: true });
  }

  async function toggleActive(r: NotificationRecipient) {
    const res = await fetch("/api/notification-recipients", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: r.id, active: !r.active }),
    });
    if (!res.ok) { toast.error("No se pudo actualizar el destinatario"); return; }
    navigate(".", { replace: true });
  }

  async function handleDelete(r: NotificationRecipient) {
    const res = await fetch("/api/notification-recipients", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: r.id }),
    });
    if (!res.ok) { toast.error("No se pudo eliminar el destinatario"); return; }
    toast.success("Destinatario eliminado");
    navigate(".", { replace: true });
  }

  return (
    <div className="space-y-4">
      <PageHeader
        action={
          <CrudFormDialog
            trigger={<Button>Nuevo destinatario</Button>}
            title="Nuevo destinatario"
            open={createOpen}
            onOpenChange={(o) => { setCreateOpen(o); if (!o) setEvents([]); }}
            onSave={handleCreate}
            saveDisabled={!userId || events.length === 0}
          >
            <div className="space-y-2">
              <Label>Eventos</Label>
              {NOTIFICATION_EVENTS.map((e) => (
                <div key={e} className="flex items-center gap-2">
                  <Checkbox
                    id={`event-${e}`}
                    checked={events.includes(e)}
                    onCheckedChange={(checked) => toggleEvent(e, checked === true)}
                  />
                  <Label htmlFor={`event-${e}`} className="font-normal cursor-pointer">
                    {NOTIFICATION_EVENT_LABEL[e]}
                  </Label>
                </div>
              ))}
            </div>
            <div className="space-y-1">
              <Label>Usuario</Label>
              <Select value={userId} onValueChange={setUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un usuario" />
                </SelectTrigger>
                <SelectContent>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={String(u.id)}>{u.name} — {u.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CrudFormDialog>
        }
      />

      <CrudFormDialog
        title="Editar destinatario"
        open={!!editTarget}
        onOpenChange={(o) => !o && setEditTarget(null)}
        onSave={handleEditSave}
        saveDisabled={!editUserId}
      >
        <div className="space-y-1">
          <Label>Evento</Label>
          <Select value={editEvent} onValueChange={setEditEvent}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {NOTIFICATION_EVENTS.map((e) => (
                <SelectItem key={e} value={e}>{NOTIFICATION_EVENT_LABEL[e]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Usuario</Label>
          <Select value={editUserId} onValueChange={setEditUserId}>
            <SelectTrigger>
              <SelectValue placeholder="Selecciona un usuario" />
            </SelectTrigger>
            <SelectContent>
              {users.map((u) => (
                <SelectItem key={u.id} value={String(u.id)}>{u.name} — {u.email}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CrudFormDialog>

      {recipients.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState message="No hay destinatarios configurados todavía." icon={Mail} />
          </CardContent>
        </Card>
      ) : (
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Evento</TableHead>
                <TableHead>Correo</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="pr-4"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recipients.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="pl-4 font-medium">{NOTIFICATION_EVENT_LABEL[r.event]}</TableCell>
                  <TableCell className="text-muted-foreground">{r.user.name} — {r.user.email}</TableCell>
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
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(r)}>
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
