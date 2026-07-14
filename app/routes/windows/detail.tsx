import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import type { Route } from "./+types/detail";
import { requireUser } from "~/lib/session.server";
import { prisma } from "~/lib/db.server";
import { checkinToken } from "~/lib/checkinToken.server";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Card, CardContent } from "~/components/ui/card";
import { Separator } from "~/components/ui/separator";
import { WindowQrDialog } from "~/components/qr/WindowQrDialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { PageHeader } from "~/components/layout/PageHeader";
import { WINDOW_STATUS_BADGE_VARIANT, WINDOW_STATUS_LABEL, WINDOW_TYPE_LABEL } from "~/lib/windowStatus";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Pencil, QrCode } from "lucide-react";

interface ClientOption {
  id: string;
  name: string;
  type: "CARGA" | "DESCARGA";
}
interface WarehouseOption {
  id: string;
  name: string;
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const [window, delayReasons] = await Promise.all([
    prisma.window.findUniqueOrThrow({
      where: { id: params.id },
      include: {
        client: true,
        warehouse: true,
        overrideRequest: true,
        delayReasonCategory: true,
      },
    }),
    prisma.delayReason.findMany({ where: { active: true }, orderBy: { label: "asc" } }),
  ]);
  return {
    window,
    delayReasons,
    role: user.role,
    checkinToken: checkinToken(window.id),
  };
}

export default function WindowDetail({ loaderData }: Route.ComponentProps) {
  const { window, delayReasons, role, checkinToken } = loaderData;
  const canComplete = role === "ALMACEN" || role === "ADMINISTRADOR";
  const canEdit = role === "ADMINISTRADOR" && window.status === "SCHEDULED";
  const navigate = useNavigate();
  const [qrOpen, setQrOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [rollsCount, setRollsCount] = useState("");
  const [delayReasonId, setDelayReasonId] = useState("");
  const [delayReason, setDelayReason] = useState("");
  const [needsDelayReason, setNeedsDelayReason] = useState(false);

  // Edit window dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editClients, setEditClients] = useState<ClientOption[]>([]);
  const [editWarehouses, setEditWarehouses] = useState<WarehouseOption[]>([]);
  const [editClientName, setEditClientName] = useState(window.client.name);
  const [editPendingType, setEditPendingType] = useState<"CARGA" | "DESCARGA" | "">(window.client.type);
  const [editWarehouseId, setEditWarehouseId] = useState(window.warehouseId);
  const [editDate, setEditDate] = useState(format(new Date(window.scheduledStart), "yyyy-MM-dd"));
  const [editTime, setEditTime] = useState(format(new Date(window.scheduledStart), "HH:mm"));
  const [editOperatorName, setEditOperatorName] = useState(window.operatorName);
  const [editLicensePlate, setEditLicensePlate] = useState(window.licensePlate);

  const editClientGroup = editClients.filter((c) => c.name === editClientName);
  const editNeedsTypeChoice = editClientGroup.length > 1;
  const editSelectedClient = editNeedsTypeChoice
    ? editClientGroup.find((c) => c.type === editPendingType)
    : editClientGroup[0];
  const editClientId = editSelectedClient?.id ?? "";
  const uniqueEditClientNames = Array.from(new Set(editClients.map((c) => c.name)));

  useEffect(() => {
    if (!editOpen) return;
    fetch("/api/clients").then((r) => r.json()).then(setEditClients);
    fetch("/api/warehouses").then((r) => r.json()).then(setEditWarehouses);
  }, [editOpen]);

  async function handleEditWindow() {
    const start = editDate && editTime ? new Date(`${editDate}T${editTime}`) : null;
    if (!start) return;
    const res = await fetch(`/api/windows/${window.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: editClientId,
        warehouseId: editWarehouseId,
        scheduledStart: start.toISOString(),
        operatorName: editOperatorName,
        licensePlate: editLicensePlate,
      }),
    });
    if (!res.ok) {
      toast.error("No se pudo actualizar la ventana");
      return;
    }
    const data = await res.json();
    if (data.conflict) {
      toast.warning("Ventana actualizada, pero se solapa con otra ventana en la misma nave");
    } else {
      toast.success("Ventana actualizada");
    }
    setEditOpen(false);
    navigate(".", { replace: true });
  }

  async function handleComplete() {
    const res = await fetch(`/api/windows/${window.id}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rollsCount,
        delayReasonId: delayReasonId || undefined,
        delayReason: delayReason || undefined,
      }),
    });
    if (res.status === 400) {
      setNeedsDelayReason(true);
      toast.error("Se superó el tiempo estimado: ingresa un motivo de retraso");
      return;
    }
    if (!res.ok) {
      toast.error("No se pudo completar la ventana");
      return;
    }
    toast.success("Ventana completada");
    setCompleteOpen(false);
    navigate(".", { replace: true });
  }

  function Field({ label, value, muted }: { label: string; value: ReactNode; muted?: boolean }) {
    return (
      <div>
        <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className={muted ? "text-muted-foreground" : "font-medium"}>{value}</p>
      </div>
    );
  }

  function SectionLabel({ children }: { children: ReactNode }) {
    return (
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pb-2">
        {children}
      </p>
    );
  }

  return (
    <div className="max-w-2xl space-y-4">
      <PageHeader
        action={
          <div className="flex gap-2">
            {canEdit && (
              <Button variant="outline" onClick={() => setEditOpen(true)}>
                <Pencil className="size-4" />
                Editar
              </Button>
            )}
            {window.status === "ARRIVED" && canComplete && (
              <Button onClick={() => setCompleteOpen(true)}>Completar</Button>
            )}
            {window.qrCode && (
              <Button variant="outline" onClick={() => setQrOpen(true)}>
                <QrCode className="size-4" />
                Ver QR
              </Button>
            )}
          </div>
        }
      />

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Estado</span>
            <Badge variant={WINDOW_STATUS_BADGE_VARIANT[window.status]}>
              {WINDOW_STATUS_LABEL[window.status]}
            </Badge>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Cliente" value={window.client.name} />
            <Field label="Nave" value={window.warehouse.name} />
            <Field label="Operador" value={window.operatorName} />
            <Field label="Placas" value={window.licensePlate} />
          </div>

          <Separator />

          <div>
            <SectionLabel>Horario estimado</SectionLabel>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Entrada estimada" value={format(new Date(window.scheduledStart), "dd/MM/yyyy HH:mm")} />
              <Field label="Salida estimada" value={format(new Date(window.scheduledEnd), "dd/MM/yyyy HH:mm")} />
            </div>
          </div>

          <div>
            <SectionLabel>Horario real</SectionLabel>
            <div className="grid grid-cols-2 gap-4">
              <Field
                label="Llegada real"
                value={window.actualArrival ? format(new Date(window.actualArrival), "dd/MM/yyyy HH:mm") : "Pendiente"}
                muted={!window.actualArrival}
              />
              <Field
                label="Salida real"
                value={window.actualEnd ? format(new Date(window.actualEnd), "dd/MM/yyyy HH:mm") : "Pendiente"}
                muted={!window.actualEnd}
              />
            </div>
          </div>

          {(window.rollsCount != null || window.delayReasonCategory || window.delayReason) && (
            <>
              <Separator />
              <div className="grid grid-cols-2 gap-4">
                {window.rollsCount != null && (
                  <Field label="Rollos embarcados" value={window.rollsCount} />
                )}
                {window.delayReasonCategory && (
                  <Field label="Motivo de retraso" value={window.delayReasonCategory.label} />
                )}
                {window.delayReason && (
                  <Field label="Detalle adicional" value={window.delayReason} />
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar ventana</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Cliente</Label>
              <Select
                value={editClientName}
                onValueChange={(v) => { setEditClientName(v); setEditPendingType(""); }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {uniqueEditClientNames.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {editNeedsTypeChoice && (
              <div className="space-y-1">
                <Label>Tipo de operación</Label>
                <Select value={editPendingType} onValueChange={(v) => setEditPendingType(v as "CARGA" | "DESCARGA")}>
                  <SelectTrigger>
                    <SelectValue placeholder="Este cliente tiene Carga y Descarga — selecciona una" />
                  </SelectTrigger>
                  <SelectContent>
                    {editClientGroup.map((c) => (
                      <SelectItem key={c.id} value={c.type}>
                        {WINDOW_TYPE_LABEL[c.type]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {editSelectedClient && !editNeedsTypeChoice && (
              <p className="text-xs text-muted-foreground">
                Tipo de operación: <span className="font-medium text-foreground">{WINDOW_TYPE_LABEL[editSelectedClient.type]}</span>
              </p>
            )}
            <div className="space-y-1">
              <Label>Nave</Label>
              <Select value={editWarehouseId} onValueChange={setEditWarehouseId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {editWarehouses.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-3">
              <div className="space-y-1 flex-1">
                <Label htmlFor="editWdate">Fecha</Label>
                <Input id="editWdate" type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} />
              </div>
              <div className="space-y-1 flex-1">
                <Label htmlFor="editWtime">Hora de llegada</Label>
                <Input id="editWtime" type="time" value={editTime} onChange={(e) => setEditTime(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="editOpName">Nombre del operador</Label>
              <Input id="editOpName" value={editOperatorName} onChange={(e) => setEditOperatorName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="editPlate">Placas</Label>
              <Input id="editPlate" value={editLicensePlate} onChange={(e) => setEditLicensePlate(e.target.value)} />
            </div>
            <Button
              className="w-full"
              onClick={handleEditWindow}
              disabled={!editClientId || !editWarehouseId || !editOperatorName || !editLicensePlate || !editDate || !editTime}
            >
              Guardar cambios
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={completeOpen} onOpenChange={setCompleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Completar ventana</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="rollsCount">Rollos embarcados</Label>
              <Input
                id="rollsCount"
                type="number"
                value={rollsCount}
                onChange={(e) => setRollsCount(e.target.value)}
              />
            </div>
            {needsDelayReason && (
              <>
                <div className="space-y-1">
                  <Label htmlFor="delayReasonId">Motivo del retraso</Label>
                  <Select value={delayReasonId} onValueChange={setDelayReasonId}>
                    <SelectTrigger id="delayReasonId">
                      <SelectValue placeholder="Selecciona un motivo" />
                    </SelectTrigger>
                    <SelectContent>
                      {delayReasons.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="delayReason">Detalle adicional (opcional)</Label>
                  <Textarea
                    id="delayReason"
                    value={delayReason}
                    onChange={(e) => setDelayReason(e.target.value)}
                  />
                </div>
              </>
            )}
            <Button
              onClick={handleComplete}
              disabled={!rollsCount || (needsDelayReason && !delayReasonId)}
            >
              Confirmar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {window.qrCode && (
        <WindowQrDialog open={qrOpen} onOpenChange={setQrOpen} window={window} checkinToken={checkinToken} />
      )}
    </div>
  );
}
