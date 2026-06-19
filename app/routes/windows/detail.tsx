import { useState } from "react";
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
  const [delayReason, setDelayReason] = useState("");
  const [needsDelayReason, setNeedsDelayReason] = useState(false);

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
      body: JSON.stringify({ rollsCount, delayReason: delayReason || undefined }),
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

  return (
    <div className="max-w-xl space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">{window.client.name}</h1>
        <Badge>{window.status}</Badge>
      </div>

      <Card>
        <CardContent className="space-y-2 pt-6">
          <p>Nave: {window.warehouse.name}</p>
          <p>Tier: {window.client.tier.name}</p>
          <p>Operador: {window.operatorName}</p>
          <p>Placas: {window.licensePlate}</p>
          <p>
            Horario: {format(new Date(window.scheduledStart), "dd/MM/yyyy HH:mm")} -{" "}
            {format(new Date(window.scheduledEnd), "HH:mm")}
          </p>
          {window.rollsCount != null && <p>Rollos embarcados: {window.rollsCount}</p>}
          {window.delayReason && <p>Motivo de retraso: {window.delayReason}</p>}
        </CardContent>
      </Card>

      <div className="flex gap-2">
        {window.status === "SCHEDULED" && <Button onClick={handleStart}>Iniciar</Button>}
        {window.status === "IN_PROGRESS" && (
          <Button onClick={() => setCompleteOpen(true)}>Completar</Button>
        )}
        {window.qrCode && <Button variant="outline" onClick={() => setQrOpen(true)}>Ver QR</Button>}
      </div>

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
              <div className="space-y-1">
                <Label htmlFor="delayReason">Motivo del retraso</Label>
                <Textarea
                  id="delayReason"
                  value={delayReason}
                  onChange={(e) => setDelayReason(e.target.value)}
                />
              </div>
            )}
            <Button onClick={handleComplete} disabled={!rollsCount}>
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
