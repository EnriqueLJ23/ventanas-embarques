import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router";
import type { Route } from "./+types/calendar";
import { requireUser } from "~/lib/session.server";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Separator } from "~/components/ui/separator";
import {
  ShipmentCalendar,
  type CalendarEvent,
  type CalendarResource,
} from "~/components/calendar/ShipmentCalendar";
import { WindowQrDialog } from "~/components/qr/WindowQrDialog";
import { WINDOW_TYPE_LABEL } from "~/lib/windowStatus";
import { PageHeader } from "~/components/layout/PageHeader";
import { Card, CardContent } from "~/components/ui/card";
import { Plus } from "lucide-react";
import { format, addMinutes } from "date-fns";
import { toast } from "sonner";

const STATUS_LEGEND: { label: string; colorClass: string }[] = [
  { label: "Programada", colorClass: "bg-slate-500" },
  { label: "Llegó a planta", colorClass: "bg-amber-600" },
  { label: "En curso", colorClass: "bg-blue-600" },
  { label: "Completada", colorClass: "bg-green-600" },
  { label: "Cancelada", colorClass: "bg-red-600" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request, ["VENTAS", "ADMINISTRADOR"]);
  return { role: user.role };
}

interface ClientOption {
  id: string;
  name: string;
  avgLoadTime: number;
  defaultArrivalTime: string | null;
  preferredWarehouseId: string | null;
}
interface WarehouseOption {
  id: string;
  name: string;
}

export default function Calendar({ loaderData }: Route.ComponentProps) {
  const { role } = loaderData;
  const navigate = useNavigate();

  // Calendar data
  const [resources, setResources] = useState<CalendarResource[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));

  // New window dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [clientId, setClientId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [windowDate, setWindowDate] = useState("");
  const [time, setTime] = useState("");
  const [operatorName, setOperatorName] = useState("");
  const [licensePlate, setLicensePlate] = useState("");
  const [type, setType] = useState<"CARGA" | "DESCARGA" | "">("");
  const [qrOpen, setQrOpen] = useState(false);
  const [createdWindow, setCreatedWindow] = useState<any>(null);

  const fetchEvents = useCallback(() => {
    fetch(`/api/windows?date=${date}`)
      .then((r) => r.json())
      .then((windows) =>
        setEvents(
          windows.map((w: any) => ({
            id: w.id,
            resourceId: w.warehouseId,
            title: `${w.client.name} (${w.operatorName})`,
            start: w.scheduledStart,
            end: w.scheduledEnd,
            status: w.status,
          }))
        )
      );
  }, [date]);

  useEffect(() => {
    fetch("/api/warehouses")
      .then((r) => r.json())
      .then((whs) => setResources(whs.map((w: any) => ({ id: w.id, title: w.name }))));
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Load clients + warehouses when dialog opens
  useEffect(() => {
    if (!dialogOpen) return;
    fetch("/api/clients").then((r) => r.json()).then(setClients);
    fetch("/api/warehouses").then((r) => r.json()).then(setWarehouses);
  }, [dialogOpen]);

  const selectedClient = clients.find((c) => c.id === clientId);
  const start = windowDate && time ? new Date(`${windowDate}T${time}`) : null;
  const end = start && selectedClient ? addMinutes(start, selectedClient.avgLoadTime) : null;
  const selectedWarehouse = warehouses.find((w) => w.id === warehouseId);

  useEffect(() => {
    if (selectedClient?.defaultArrivalTime && !time) {
      setTime(selectedClient.defaultArrivalTime);
    }
  }, [selectedClient]);

  useEffect(() => {
    setWarehouseId(selectedClient?.preferredWarehouseId ?? "");
  }, [selectedClient]);

  function resetForm() {
    setClientId(""); setWarehouseId(""); setWindowDate(date);
    setTime(""); setOperatorName(""); setLicensePlate(""); setType("");
  }

  async function handleSubmit() {
    if (!clientId || !warehouseId || !start) return;
    const res = await fetch("/api/windows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId, warehouseId,
        scheduledStart: start.toISOString(),
        operatorName, licensePlate, type,
      }),
    });
    if (!res.ok) { toast.error("No se pudo crear la ventana"); return; }
    const data = await res.json();
    setCreatedWindow(data.window);
    setDialogOpen(false);
    setQrOpen(true);
    if (data.overridden) {
      toast.warning("Ventana creada con conflicto de horario — pendiente de revisión del administrador");
    } else {
      toast.success("Ventana creada");
    }
    resetForm();
    fetchEvents();
  }

  const canCreate = role === "VENTAS" || role === "ADMINISTRADOR";

  return (
    <div className="flex h-full flex-col space-y-4">
      <PageHeader
        title="Calendario de ventanas"
        description="Vista por nave de las ventanas programadas, en curso y completadas."
        action={
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              {STATUS_LEGEND.map((s) => (
                <span key={s.label} className="flex items-center gap-1.5">
                  <span className={`size-2 rounded-full ${s.colorClass}`} />
                  {s.label}
                </span>
              ))}
            </div>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-40 h-8 text-sm"
            />
            {canCreate && (
              <Button size="sm" onClick={() => setDialogOpen(true)}>
                <Plus className="size-4 mr-1" />
                Nueva ventana
              </Button>
            )}
          </div>
        }
      />

      <Card className="flex min-h-0 flex-1 flex-col py-2">
        <CardContent className="min-h-0 flex-1 px-2">
          <ShipmentCalendar
            resources={resources}
            events={events}
            onEventClick={(id) => navigate(`/windows/${id}`)}
          />
        </CardContent>
      </Card>

      {/* Nueva ventana dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nueva ventana de embarque</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Cliente</Label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un cliente" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedClient && (
              <p className="text-xs text-muted-foreground">
                Tiempo estimado: <span className="font-medium">{selectedClient.avgLoadTime} min</span>
              </p>
            )}

            {selectedClient?.preferredWarehouseId ? (
              <p className="text-xs text-muted-foreground">
                Nave asignada: <span className="font-medium text-foreground">{selectedWarehouse?.name ?? "—"}</span>
              </p>
            ) : selectedClient ? (
              <div className="space-y-1">
                <Label>Nave</Label>
                <Select value={warehouseId} onValueChange={setWarehouseId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Este cliente no tiene nave preferida — selecciona una" />
                  </SelectTrigger>
                  <SelectContent>
                    {warehouses.map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            <Separator />

            <div className="space-y-1">
              <Label>Tipo de operación</Label>
              <Select value={type} onValueChange={(v) => setType(v as "CARGA" | "DESCARGA")}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona Carga o Descarga" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CARGA">{WINDOW_TYPE_LABEL.CARGA}</SelectItem>
                  <SelectItem value="DESCARGA">{WINDOW_TYPE_LABEL.DESCARGA}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-3">
              <div className="space-y-1 flex-1">
                <Label htmlFor="wdate">Fecha</Label>
                <Input id="wdate" type="date" value={windowDate} onChange={(e) => setWindowDate(e.target.value)} />
              </div>
              <div className="space-y-1 flex-1">
                <Label htmlFor="wtime">Hora de llegada</Label>
                <Input id="wtime" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
              </div>
            </div>

            {end && (
              <p className="text-sm text-muted-foreground">
                Hora estimada de fin:{" "}
                <span className="font-medium text-foreground">{format(end, "HH:mm")}</span>
              </p>
            )}

            <Separator />

            <div className="space-y-1">
              <Label htmlFor="opName">Nombre del operador</Label>
              <Input id="opName" value={operatorName} onChange={(e) => setOperatorName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="plate">Placas</Label>
              <Input id="plate" value={licensePlate} onChange={(e) => setLicensePlate(e.target.value)} />
            </div>

            <Button
              className="w-full"
              onClick={handleSubmit}
              disabled={!clientId || !warehouseId || !start || !operatorName || !licensePlate || !type}
            >
              Guardar ventana
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* QR dialog after creation */}
      {createdWindow && (
        <WindowQrDialog open={qrOpen} onOpenChange={setQrOpen} window={createdWindow} />
      )}
    </div>
  );
}
