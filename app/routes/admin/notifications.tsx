import { useMemo, useState } from "react";
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
import { NOTIFICATION_EVENTS, NOTIFICATION_EVENT_LABEL } from "~/lib/notificationEvents";

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request, ["ADMINISTRADOR"]);
  const [recipients, users] = await Promise.all([
    prisma.notificationRecipient.findMany({
      where: { active: true },
      orderBy: [{ user: { name: "asc" } }, { event: "asc" }],
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

type RecipientGroup = {
  user: { id: number; name: string; email: string };
  events: string[];
};

export default function NotificationsAdmin({ loaderData }: Route.ComponentProps) {
  const { recipients, users } = loaderData;
  const navigate = useNavigate();

  const groups = useMemo(() => {
    const byUser = new Map<number, RecipientGroup>();
    for (const r of recipients) {
      if (!byUser.has(r.userId)) byUser.set(r.userId, { user: r.user, events: [] });
      byUser.get(r.userId)!.events.push(r.event);
    }
    return [...byUser.values()].sort((a, b) => a.user.name.localeCompare(b.user.name));
  }, [recipients]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"create" | "edit">("create");
  const [dialogUserId, setDialogUserId] = useState("");
  const [dialogUserLabel, setDialogUserLabel] = useState("");
  const [dialogEvents, setDialogEvents] = useState<string[]>([]);

  function openCreate() {
    setDialogMode("create");
    setDialogUserId("");
    setDialogUserLabel("");
    setDialogEvents([]);
    setDialogOpen(true);
  }

  function openEdit(group: RecipientGroup) {
    setDialogMode("edit");
    setDialogUserId(String(group.user.id));
    setDialogUserLabel(`${group.user.name} — ${group.user.email}`);
    setDialogEvents(group.events);
    setDialogOpen(true);
  }

  function selectDialogUser(id: string) {
    setDialogUserId(id);
    // Prefill with this user's existing events so saving never silently
    // wipes out subscriptions they already had.
    const existing = groups.find((g) => String(g.user.id) === id);
    setDialogEvents(existing ? existing.events : []);
  }

  function toggleDialogEvent(event: string, checked: boolean) {
    setDialogEvents((prev) => (checked ? [...prev, event] : prev.filter((e) => e !== event)));
  }

  async function handleSave() {
    const res = await fetch("/api/notification-recipients", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: dialogUserId, events: dialogEvents }),
    });
    if (!res.ok) { toast.error("No se pudo guardar el destinatario"); return; }
    toast.success("Destinatario guardado");
    setDialogOpen(false);
    navigate(".", { replace: true });
  }

  async function handleDelete(group: RecipientGroup) {
    const res = await fetch("/api/notification-recipients", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: group.user.id }),
    });
    if (!res.ok) { toast.error("No se pudo eliminar el destinatario"); return; }
    toast.success("Destinatario eliminado");
    navigate(".", { replace: true });
  }

  return (
    <div className="space-y-4">
      <PageHeader
        action={<Button onClick={openCreate}>Nuevo destinatario</Button>}
      />

      <CrudFormDialog
        title={dialogMode === "create" ? "Nuevo destinatario" : "Editar destinatario"}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSave={handleSave}
        saveDisabled={!dialogUserId}
      >
        <div className="space-y-1">
          <Label>Usuario</Label>
          {dialogMode === "edit" ? (
            <p className="rounded-md border p-2 text-sm text-muted-foreground">{dialogUserLabel}</p>
          ) : (
            <Select value={dialogUserId} onValueChange={selectDialogUser}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona un usuario" />
              </SelectTrigger>
              <SelectContent>
                {users.map((u) => (
                  <SelectItem key={u.id} value={String(u.id)}>{u.name} — {u.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="space-y-2">
          <Label>Eventos</Label>
          {NOTIFICATION_EVENTS.map((e) => (
            <div key={e} className="flex items-center gap-2">
              <Checkbox
                id={`event-${e}`}
                checked={dialogEvents.includes(e)}
                onCheckedChange={(checked) => toggleDialogEvent(e, checked === true)}
              />
              <Label htmlFor={`event-${e}`} className="font-normal cursor-pointer">
                {NOTIFICATION_EVENT_LABEL[e]}
              </Label>
            </div>
          ))}
        </div>
      </CrudFormDialog>

      {groups.length === 0 ? (
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
                <TableHead className="pl-4">Usuario</TableHead>
                <TableHead>Eventos</TableHead>
                <TableHead className="pr-4"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map((g) => (
                <TableRow key={g.user.id}>
                  <TableCell className="pl-4 font-medium">
                    {g.user.name}
                    <span className="block font-normal text-muted-foreground">{g.user.email}</span>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {g.events.map((e) => (
                        <Badge key={e} variant="outline">{NOTIFICATION_EVENT_LABEL[e as keyof typeof NOTIFICATION_EVENT_LABEL]}</Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="pr-4">
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => openEdit(g)}>
                        Editar
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(g)}>
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
