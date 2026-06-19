import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import type { Route } from "./+types/new";
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
import { Alert, AlertTitle, AlertDescription } from "~/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Textarea } from "~/components/ui/textarea";
import { WindowQrDialog } from "~/components/qr/WindowQrDialog";
import { toast } from "sonner";
import { addMinutes, format } from "date-fns";

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request, ["VENTAS", "ADMINISTRADOR"]);
  return {};
}

interface ClientOption {
  id: string;
  name: string;
  avgLoadTime: number;
  defaultArrivalTime: string | null;
  tier: { name: string; priority: number };
}
interface WarehouseOption {
  id: string;
  name: string;
}

export default function NewWindow() {
  const navigate = useNavigate();
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [clientId, setClientId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [operatorName, setOperatorName] = useState("");
  const [licensePlate, setLicensePlate] = useState("");
  const [conflict, setConflict] = useState<any>(null);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [qrOpen, setQrOpen] = useState(false);
  const [createdWindow, setCreatedWindow] = useState<any>(null);

  useEffect(() => {
    fetch("/api/clients").then((r) => r.json()).then(setClients);
    fetch("/api/warehouses").then((r) => r.json()).then(setWarehouses);
  }, []);

  const selectedClient = clients.find((c) => c.id === clientId);
  const start = date && time ? new Date(`${date}T${time}`) : null;
  const end = start && selectedClient ? addMinutes(start, selectedClient.avgLoadTime) : null;

  useEffect(() => {
    if (selectedClient?.defaultArrivalTime && !time) {
      setTime(selectedClient.defaultArrivalTime);
    }
  }, [selectedClient]);

  useEffect(() => {
    if (!warehouseId || !start || !end) {
      setConflict(null);
      return;
    }
    const params = new URLSearchParams({
      warehouseId,
      start: start.toISOString(),
      end: end.toISOString(),
    });
    fetch(`/api/windows/conflicts?${params}`)
      .then((r) => r.json())
      .then((data) => setConflict(data.conflict));
  }, [warehouseId, start?.getTime(), end?.getTime()]);

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
    if (res.status === 409) {
      const data = await res.json();
      setConflict(data.conflict);
      toast.error("Existe un conflicto de horario en esta nave");
      return;
    }
    if (!res.ok) {
      toast.error("No se pudo crear la ventana");
      return;
    }
    const data = await res.json();
    setCreatedWindow(data.window);
    setQrOpen(true);
    toast.success("Ventana creada");
  }

  async function handleOverrideRequest() {
    if (!clientId || !warehouseId || !start) return;
    const res = await fetch("/api/overrides", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId,
        warehouseId,
        scheduledStart: start.toISOString(),
        operatorName,
        licensePlate,
        reason: overrideReason,
      }),
    });
    if (!res.ok) {
      toast.error("No se pudo enviar la solicitud");
      return;
    }
    toast.success("Solicitud de excepción enviada al administrador");
    setOverrideOpen(false);
    navigate("/calendar");
  }

  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-2xl font-bold">Nueva ventana de embarque</h1>

      <div className="space-y-1">
        <Label>Cliente</Label>
        <Select value={clientId} onValueChange={setClientId}>
          <SelectTrigger>
            <SelectValue placeholder="Selecciona un cliente" />
          </SelectTrigger>
          <SelectContent>
            {clients.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name} ({c.tier.name})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label>Nave</Label>
        <Select value={warehouseId} onValueChange={setWarehouseId}>
          <SelectTrigger>
            <SelectValue placeholder="Selecciona una nave" />
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

      <div className="flex gap-3">
        <div className="space-y-1 flex-1">
          <Label htmlFor="date">Fecha</Label>
          <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="space-y-1 flex-1">
          <Label htmlFor="time">Hora de llegada</Label>
          <Input id="time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
      </div>

      {end && (
        <p className="text-sm text-muted-foreground">
          Hora estimada de fin: {format(end, "HH:mm")}
        </p>
      )}

      <div className="space-y-1">
        <Label htmlFor="operatorName">Nombre del operador</Label>
        <Input id="operatorName" value={operatorName} onChange={(e) => setOperatorName(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="licensePlate">Placas</Label>
        <Input id="licensePlate" value={licensePlate} onChange={(e) => setLicensePlate(e.target.value)} />
      </div>

      {conflict && (
        <Alert variant="destructive">
          <AlertTitle>Conflicto de horario</AlertTitle>
          <AlertDescription>
            Ya existe la ventana de {conflict.client.name} ({format(new Date(conflict.scheduledStart), "HH:mm")}
            {" - "}
            {format(new Date(conflict.scheduledEnd), "HH:mm")}) en esta nave.
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => setOverrideOpen(true)}
            >
              Solicitar excepción al administrador
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <Button
        onClick={handleSubmit}
        disabled={!clientId || !warehouseId || !start || !operatorName || !licensePlate || !!conflict}
      >
        Guardar ventana
      </Button>

      <Dialog open={overrideOpen} onOpenChange={setOverrideOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Solicitar excepción</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Label htmlFor="overrideReason">Motivo</Label>
            <Textarea
              id="overrideReason"
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
            />
            <Button onClick={handleOverrideRequest} disabled={!overrideReason}>
              Enviar solicitud
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {createdWindow && (
        <WindowQrDialog open={qrOpen} onOpenChange={setQrOpen} window={createdWindow} />
      )}
    </div>
  );
}
