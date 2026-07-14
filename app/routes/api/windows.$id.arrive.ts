import type { Route } from "./+types/windows.$id.arrive";
import { getOptionalUserId } from "~/lib/session.server";
import { prisma } from "~/lib/db.server";
import { logActivity } from "~/lib/activity.server";
import { canArrive } from "~/lib/windowTransitions";
import { sendEmail } from "~/services/email.server";
import { WINDOW_TYPE_LABEL } from "~/lib/windowStatus";
import { getRecipientEmails } from "~/lib/notificationRecipients.server";
import { verifyCheckinToken } from "~/lib/checkinToken.server";
import { escapeHtml } from "~/lib/escapeHtml";
import { format } from "date-fns";

export async function action({ request, params }: Route.ActionArgs) {
  const sessionUserId = await getOptionalUserId(request);

  let body: { token?: string } = {};
  try {
    body = await request.json();
  } catch {
    // POST sin body (p. ej. QR antiguo) — se valida abajo
  }

  // Endpoint público (los guardias no tienen cuenta): exige el token firmado
  // del QR, o bien una sesión autenticada (usuarios internos).
  if (sessionUserId === null && !verifyCheckinToken(params.id, body.token)) {
    return Response.json({ error: "unauthorized" }, { status: 403 });
  }
  const userId = sessionUserId ?? 0;

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
    userId,
    action: "ARRIVE",
    entity: "Window",
    entityId: window.id,
  });

  const recipients = await getRecipientEmails("ARRIVAL");
  if (recipients.length > 0) {
    try {
      await sendEmail({
        fromEmail: process.env.MAIL_SENDER!,
        toAddresses: recipients,
        subject: "Unidad ingresó a planta",
        bodyHtml: `
          <p><strong>Folio:</strong> ${window.id}</p>
          <p><strong>Operador:</strong> ${escapeHtml(window.operatorName)}</p>
          <p><strong>Placas:</strong> ${escapeHtml(window.licensePlate)}</p>
          <p><strong>Tipo de operación:</strong> ${WINDOW_TYPE_LABEL[window.type]}</p>
          <p><strong>Hora de llegada:</strong> ${format(actualArrival, "dd/MM/yyyy HH:mm")}</p>
        `,
      });
    } catch (err) {
      console.error("No se pudo enviar el correo de llegada:", err);
    }
  } else {
    await logActivity({
      userId,
      action: "NOTIFY_SKIPPED",
      entity: "Window",
      entityId: window.id,
      detail: "Sin destinatarios configurados para el evento Llegada a planta",
    });
  }

  return Response.json(window);
}
