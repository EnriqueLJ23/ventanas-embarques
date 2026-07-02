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
import { DELAY_REASON_CATEGORY_LABEL } from "~/lib/delayReasons";
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
  const window = await prisma.window.findUniqueOrThrow({
    where: { id: params.id },
    include: { client: { include: { tier: true } }, warehouse: true, overrideRequest: true },
  });
  return { window };
}

export default function WindowDetail({ loaderData }: Route.ComponentProps) {
  const { window } = loaderData;
  const navigate = useNavigate();
  const [qrOpen, setQrOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [rollsCount, setRollsCount] = useState("");
  const [delayReasonCategory, setDelayReasonCategory] = useState("");
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
        delayReasonCategory: delayReasonCategory || undefined,
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
        description={`Tier ${window.client.tier.name}`}
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
              <Field
                label="Motivo de retraso"
                value={DELAY_REASON_CATEGORY_LABEL[window.delayReasonCategory]}
              />
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
                  <Label htmlFor="delayReasonCategory">Motivo del retraso</Label>
                  <Select value={delayReasonCategory} onValueChange={setDelayReasonCategory}>
                    <SelectTrigger id="delayReasonCategory">
                      <SelectValue placeholder="Selecciona un motivo" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(DELAY_REASON_CATEGORY_LABEL).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
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
              disabled={!rollsCount || (needsDelayReason && !delayReasonCategory)}
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
