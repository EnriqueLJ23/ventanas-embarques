import type { Route } from "./+types/windows.$id.arrive";
import { requireUser } from "~/lib/session.server";
import { prisma } from "~/lib/db.server";
import { logActivity } from "~/lib/activity.server";
import { canArrive } from "~/lib/windowTransitions";
import { sendEmail } from "~/services/email.server";
import { WINDOW_TYPE_LABEL } from "~/lib/windowStatus";
import { format } from "date-fns";

export async function action({ request, params }: Route.ActionArgs) {
  const user = await requireUser(request, ["CARGA", "DESCARGA", "ADMINISTRADOR"]);

  const existing = await prisma.window.findUniqueOrThrow({
    where: { id: params.id },
  });

  if (!canArrive(existing.status)) {
    return Response.json({ error: "not_scheduled", window: existing }, { status: 409 });
  }

  const actualArrival = new Date();
  const window = await prisma.window.update({
    where: { id: params.id },
    data: { status: "ARRIVED", actualArrival },
  });

  await logActivity({
    userId: user.id,
    action: "ARRIVE",
    entity: "Window",
    entityId: window.id,
  });

  const recipient = process.env.ARRIVAL_NOTIFICATION_EMAIL;
  if (recipient) {
    try {
      await sendEmail({
        fromEmail: process.env.MAIL_SENDER!,
        toAddresses: [recipient],
        subject: "Unidad ingresó a planta",
        bodyHtml: `
          <p><strong>Folio:</strong> ${window.id}</p>
          <p><strong>Operador:</strong> ${window.operatorName}</p>
          <p><strong>Placas:</strong> ${window.licensePlate}</p>
          <p><strong>Tipo de operación:</strong> ${WINDOW_TYPE_LABEL[window.type]}</p>
          <p><strong>Hora de llegada:</strong> ${format(actualArrival, "dd/MM/yyyy HH:mm")}</p>
        `,
      });
    } catch (err) {
      console.error("No se pudo enviar el correo de llegada:", err);
    }
  } else {
    console.warn(
      "ARRIVAL_NOTIFICATION_EMAIL no está configurado; se omite el correo de llegada."
    );
  }

  return Response.json(window);
}
