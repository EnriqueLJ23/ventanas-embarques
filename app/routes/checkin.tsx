import { useState } from "react";
import type { Route } from "./+types/checkin";
import { prisma } from "~/lib/db.server";
import { verifyCheckinToken } from "~/lib/checkinToken.server";
import { getOptionalUserId } from "~/lib/session.server";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { toast } from "sonner";
import { format } from "date-fns";
import { WINDOW_STATUS_BADGE_VARIANT, WINDOW_STATUS_LABEL } from "~/lib/windowStatus";
import { CheckCircle2 } from "lucide-react";

export async function loader({ request, params }: Route.LoaderArgs) {
  const window = await prisma.window.findUnique({
    where: { id: params.id },
    include: { client: true, warehouse: true },
  });
  if (!window) {
    throw new Response("Ventana no encontrada", { status: 404 });
  }
  const token = new URL(request.url).searchParams.get("t");
  const canConfirm =
    verifyCheckinToken(window.id, token) ||
    (await getOptionalUserId(request)) !== null;
  return { window, token, canConfirm };
}

export default function Checkin({ loaderData }: Route.ComponentProps) {
  const { window, token, canConfirm } = loaderData;
  const [status, setStatus] = useState(window.status);
  const [loading, setLoading] = useState(false);

  async function handleConfirm() {
    setLoading(true);
    const res = await fetch(`/api/windows/${window.id}/arrive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    setLoading(false);
    if (!res.ok && res.status !== 409) {
      toast.error("No se pudo registrar la llegada");
      return;
    }
    toast.success("Llegada registrada");
    setStatus("ARRIVED");
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <CardTitle>{window.client.name}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground uppercase">Operador</p>
              <p className="font-medium">{window.operatorName}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase">Placas</p>
              <p className="font-medium">{window.licensePlate}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase">Nave</p>
              <p className="font-medium">{window.warehouse.name}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase">Hora programada</p>
              <p className="font-medium">{format(new Date(window.scheduledStart), "HH:mm")}</p>
            </div>
          </div>

          {status === "SCHEDULED" ? (
            canConfirm ? (
              <Button className="w-full" size="lg" onClick={handleConfirm} disabled={loading}>
                Confirmar llegada
              </Button>
            ) : (
              <p className="text-center text-sm text-muted-foreground">
                Este código QR no es válido o está incompleto. Solicita al área
                de ventas un QR actualizado para registrar la llegada.
              </p>
            )
          ) : (
            <div className="flex flex-col items-center gap-2 py-4 text-center">
              <CheckCircle2 className="size-10 text-green-600" />
              <Badge variant={WINDOW_STATUS_BADGE_VARIANT[status]}>
                {WINDOW_STATUS_LABEL[status]}
              </Badge>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
