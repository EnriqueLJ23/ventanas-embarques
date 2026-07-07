import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import type { Route } from "./+types/detail";
import { requireUser } from "~/lib/session.server";
import { prisma } from "~/lib/db.server";
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
import { WindowQrDialog } from "~/components/qr/WindowQrDialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { PageHeader } from "~/components/layout/PageHeader";
import { WINDOW_STATUS_BADGE_VARIANT, WINDOW_STATUS_LABEL } from "~/lib/windowStatus";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { QrCode } from "lucide-react";

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireUser(request);
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
  return { window, delayReasons };
}

export default function WindowDetail({ loaderData }: Route.ComponentProps) {
  const { window, delayReasons } = loaderData;
  const navigate = useNavigate();
  const [qrOpen, setQrOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [rollsCount, setRollsCount] = useState("");
  const [delayReasonId, setDelayReasonId] = useState("");
  const [delayReason, setDelayReason] = useState("");
  const [needsDelayReason, setNeedsDelayReason] = useState(false);

  async function handleArrive() {
    const res = await fetch(`/api/windows/${window.id}/arrive`, { method: "POST" });
    if (!res.ok) {
      toast.error("No se pudo registrar la llegada");
      return;
    }
    toast.success("Llegada registrada");
    navigate(".", { replace: true });
  }

  async function handleStart() {
    const res = await fetch(`/api/windows/${window.id}/start`, { method: "POST" });
    if (!res.ok) {
      toast.error("No se pudo iniciar la ventana");
      return;
    }
    toast.success("Ventana iniciada");
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

  function Field({ label, value }: { label: string; value: ReactNode }) {
    return (
      <div>
        <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className="font-medium">{value}</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-4">
      <PageHeader
        title={window.client.name}
        description={window.warehouse.name}
        action={
          <div className="flex gap-2">
            {window.status === "SCHEDULED" && (
              <Button variant="outline" onClick={handleArrive}>
                Confirmar llegada
              </Button>
            )}
            {(window.status === "SCHEDULED" || window.status === "ARRIVED") && (
              <Button onClick={handleStart}>Iniciar</Button>
            )}
            {window.status === "IN_PROGRESS" && (
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
        <CardContent className="pt-6">
          <div className="flex items-center justify-between pb-4">
            <span className="text-sm text-muted-foreground">Estado</span>
            <Badge variant={WINDOW_STATUS_BADGE_VARIANT[window.status]}>
              {WINDOW_STATUS_LABEL[window.status]}
            </Badge>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Nave" value={window.warehouse.name} />
            <Field label="Operador" value={window.operatorName} />
            <Field label="Placas" value={window.licensePlate} />
            <Field
              label="Horario"
              value={`${format(new Date(window.scheduledStart), "dd/MM/yyyy HH:mm")} - ${format(new Date(window.scheduledEnd), "HH:mm")}`}
            />
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
        </CardContent>
      </Card>

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
        <WindowQrDialog open={qrOpen} onOpenChange={setQrOpen} window={window} />
      )}
    </div>
  );
}
