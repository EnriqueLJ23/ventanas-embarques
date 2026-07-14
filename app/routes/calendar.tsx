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
import {
  WINDOW_STATUS_COLOR,
  WINDOW_STATUS_LABEL,
  WINDOW_TYPE_LABEL,
} from "~/lib/windowStatus";
import type { WindowStatus } from "@prisma/client";
import { PageHeader } from "~/components/layout/PageHeader";
import { Card, CardContent } from "~/components/ui/card";
import { Plus } from "lucide-react";
import { format, addMinutes } from "date-fns";
import { toast } from "sonner";

/* Derivada de windowStatus.ts para que la leyenda nunca diverja del color
   real de los eventos del calendario. */
const STATUS_LEGEND = (
  Object.keys(WINDOW_STATUS_LABEL) as WindowStatus[]
).map((status) => ({
  label: WINDOW_STATUS_LABEL[status],
  color: WINDOW_STATUS_COLOR[status],
}));

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request, ["VENTAS", "ADMINISTRADOR"]);
  return { role: user.role };
}

interface ClientOption {
  id: string;
  name: string;
  type: "CARGA" | "DESCARGA";
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
  const [clientName, setClientName] = useState("");
  const [pendingType, setPendingType] = useState<"CARGA" | "DESCARGA" | "">("");
  const [warehouseId, setWarehouseId] = useState("");
  const [windowDate, setWindowDate] = useState("");
  const [time, setTime] = useState("");
  const [operatorName, setOperatorName] = useState("");
  const [licensePlate, setLicensePlate] = useState("");
  const [qrOpen, setQrOpen] = useState(false);
  const [createdWindow, setCreatedWindow] = useState<any>(null);
  const [createdToken, setCreatedToken] = useState<string | undefined>();

  const fetchEvents = useCallback(() => {
    fetch(`/api/windows?date=${date}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((windows) =>
        setEvents(
          windows.map((w: any) => ({
            id: w.id,
            resourceId: w.warehouseId,
            title: `${w.client.name} (${w.operatorName})`,
            start: w.scheduledStart,
            end: w.scheduledEnd,
            status: w.status,
          })),
        ),
      )
      .catch(() => toast.error("No se pudieron cargar las ventanas del día"));
  }, [date]);

  // Warehouses se cargan una sola vez: alimentan tanto las filas del
  // calendario como el select de Nave del diálogo.
  useEffect(() => {
    fetch("/api/warehouses")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((whs) => {
        setResources(whs.map((w: any) => ({ id: w.id, title: w.name })));
        setWarehouses(whs.map((w: any) => ({ id: w.id, name: w.name })));
      })
      .catch(() => toast.error("No se pudieron cargar las naves"));
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Load clients when dialog opens
  useEffect(() => {
    if (!dialogOpen) return;
    fetch("/api/clients")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setClients)
      .catch(() => toast.error("No se pudieron cargar los clientes"));
  }, [dialogOpen]);

  const clientGroup = clients.filter((c) => c.name === clientName);
  const needsTypeChoice = clientGroup.length > 1;
  const selectedClient = needsTypeChoice
    ? clientGroup.find((c) => c.type === pendingType)
    : clientGroup[0];
  const clientId = selectedClient?.id ?? "";
  const uniqueClientNames = Array.from(new Set(clients.map((c) => c.name)));
  const start = windowDate && time ? new Date(`${windowDate}T${time}`) : null;
  const end =
    start && selectedClient
      ? addMinutes(start, selectedClient.avgLoadTime)
      : null;
  const selectedWarehouse = warehouses.find((w) => w.id === warehouseId);

  useEffect(() => {
    setPendingType("");
  }, [clientName]);

  useEffect(() => {
    if (selectedClient?.defaultArrivalTime && !time) {
      setTime(selectedClient.defaultArrivalTime);
    }
  }, [selectedClient]);

  useEffect(() => {
    setWarehouseId(selectedClient?.preferredWarehouseId ?? "");
  }, [selectedClient]);

  function resetForm() {
    setClientName("");
    setPendingType("");
    setWarehouseId("");
    setWindowDate(date);
    setTime("");
    setOperatorName("");
    setLicensePlate("");
  }

  async function handleSubmit() {
    if (!clientId || !warehouseId || !start) return;
    const res = await fetch("/api/windows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId,
        warehouseId,
        scheduledStart: start.toISOString(),
        operatorName,
        licensePlate,
      }),
    });
    if (!res.ok) {
      toast.error("No se pudo crear la ventana");
      return;
    }
    const data = await res.json();
    setCreatedWindow(data.window);
    setCreatedToken(data.checkinToken);
    setDialogOpen(false);
    setQrOpen(true);
    if (data.overridden) {
      toast.warning(
        "Ventana creada con conflicto de horario — pendiente de revisión del administrador",
      );
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
        action={
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              {STATUS_LEGEND.map((s) => (
                <span key={s.label} className="flex items-center gap-1.5">
                  <span
                    className="size-2 rounded-full"
                    style={{ backgroundColor: s.color }}
                  />
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
              <Button
                size="sm"
                onClick={() => {
                  setWindowDate((prev) => prev || date);
                  setDialogOpen(true);
                }}
              >
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
            date={date}
            onDateChange={setDate}
            onEventClick={(id) => navigate(`/windows/${id}`)}
          />
        </CardContent>
      </Card>

      {/* Nueva ventana dialog */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(o) => {
          setDialogOpen(o);
          if (!o) resetForm();
        }}
      >
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nueva ventana de embarque</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Cliente</Label>
              <Select value={clientName} onValueChange={setClientName}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un cliente" />
                </SelectTrigger>
                <SelectContent>
                  {uniqueClientNames.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {needsTypeChoice && (
              <div className="space-y-1">
                <Label>Tipo de operación</Label>
                <Select
                  value={pendingType}
                  onValueChange={(v) =>
                    setPendingType(v as "CARGA" | "DESCARGA")
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Este cliente tiene Carga y Descarga — selecciona una" />
                  </SelectTrigger>
                  <SelectContent>
                    {clientGroup.map((c) => (
                      <SelectItem key={c.id} value={c.type}>
                        {WINDOW_TYPE_LABEL[c.type]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {selectedClient && !needsTypeChoice && (
              <p className="text-xs text-muted-foreground">
                Tipo de operación:{" "}
                <span className="font-medium text-foreground">
                  {WINDOW_TYPE_LABEL[selectedClient.type]}
                </span>
              </p>
            )}

            {selectedClient && (
              <p className="text-xs text-muted-foreground">
                Tiempo estimado:{" "}
                <span className="font-medium">
                  {selectedClient.avgLoadTime} min
                </span>
              </p>
            )}

            {selectedClient?.preferredWarehouseId ? (
              <p className="text-xs text-muted-foreground">
                Nave asignada:{" "}
                <span className="font-medium text-foreground">
                  {selectedWarehouse?.name ?? "—"}
                </span>
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

            <div className="flex gap-3">
              <div className="space-y-1 flex-1">
                <Label htmlFor="wdate">Fecha</Label>
                <Input
                  id="wdate"
                  type="date"
                  value={windowDate}
                  onChange={(e) => setWindowDate(e.target.value)}
                />
              </div>
              <div className="space-y-1 flex-1">
                <Label htmlFor="wtime">Hora de llegada</Label>
                <Input
                  id="wtime"
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                />
              </div>
            </div>

            {end && (
              <p className="text-sm text-muted-foreground">
                Hora estimada de fin:{" "}
                <span className="font-medium text-foreground">
                  {format(end, "HH:mm")}
                </span>
              </p>
            )}

            <Separator />

            <div className="space-y-1">
              <Label htmlFor="opName">Nombre del operador</Label>
              <Input
                id="opName"
                value={operatorName}
                onChange={(e) => setOperatorName(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="plate">Placas</Label>
              <Input
                id="plate"
                value={licensePlate}
                onChange={(e) => setLicensePlate(e.target.value)}
              />
            </div>

            <Button
              className="w-full"
              onClick={handleSubmit}
              disabled={
                !clientId ||
                !warehouseId ||
                !start ||
                !operatorName ||
                !licensePlate
              }
            >
              Guardar ventana
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* QR dialog after creation */}
      {createdWindow && (
        <WindowQrDialog
          open={qrOpen}
          onOpenChange={setQrOpen}
          window={createdWindow}
          checkinToken={createdToken}
        />
      )}
    </div>
  );
}
