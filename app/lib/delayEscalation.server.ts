import { prisma } from "~/lib/db.server";
import { sendEmail } from "~/services/email.server";
import { WINDOW_TYPE_LABEL } from "~/lib/windowStatus";
import { format } from "date-fns";
import { DELAY_THRESHOLDS_MINUTES, getDelayThresholdToNotify } from "./delayThresholds";
import { getRecipientEmails, delayMinutesToEvent } from "./notificationRecipients.server";
import { escapeHtml } from "./escapeHtml";

const CHECK_INTERVAL_MS = 60_000;
const MIN_THRESHOLD_MINUTES = DELAY_THRESHOLDS_MINUTES[0];

declare global {
  var __delayEscalationStarted: boolean | undefined;
}

export function startDelayEscalationWorker(): void {
  if (globalThis.__delayEscalationStarted) return;
  globalThis.__delayEscalationStarted = true;
  setInterval(() => {
    checkDelays().catch((err) => console.error("Error revisando retrasos:", err));
  }, CHECK_INTERVAL_MS);
}

export async function checkDelays(): Promise<void> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - MIN_THRESHOLD_MINUTES * 60_000);

  const overdue = await prisma.window.findMany({
    where: { status: "SCHEDULED", scheduledStart: { lte: cutoff } },
    include: { client: true, warehouse: true },
  });

  for (const window of overdue) {
    const elapsedMinutes = (now.getTime() - window.scheduledStart.getTime()) / 60_000;
    const threshold = getDelayThresholdToNotify(elapsedMinutes, window.lastDelayNotifiedMinutes);
    if (threshold === null) continue;

    await prisma.window.update({
      where: { id: window.id },
      data: { lastDelayNotifiedMinutes: threshold },
    });

    await prisma.activityLog.create({
      data: {
        userId: 0,
        action: "DELAY_NOTIFY",
        entity: "Window",
        entityId: window.id,
        detail: `Aviso de ${threshold} minutos de retraso`,
      },
    });

    const event = delayMinutesToEvent(threshold as 15 | 30 | 45 | 60);
    const recipients = await getRecipientEmails(event);
    if (recipients.length > 0) {
      try {
        await sendEmail({
          fromEmail: process.env.MAIL_SENDER!,
          toAddresses: recipients,
          subject: `Unidad con ${threshold} minutos de retraso`,
          bodyHtml: `
            <p><strong>Folio:</strong> ${window.id}</p>
            <p><strong>Cliente:</strong> ${escapeHtml(window.client.name)}</p>
            <p><strong>Operador:</strong> ${escapeHtml(window.operatorName)}</p>
            <p><strong>Placas:</strong> ${escapeHtml(window.licensePlate)}</p>
            <p><strong>Nave:</strong> ${escapeHtml(window.warehouse.name)}</p>
            <p><strong>Tipo de operación:</strong> ${WINDOW_TYPE_LABEL[window.type]}</p>
            <p><strong>Hora programada:</strong> ${format(window.scheduledStart, "dd/MM/yyyy HH:mm")}</p>
            <p><strong>Minutos de retraso:</strong> ${threshold}</p>
          `,
        });
      } catch (err) {
        console.error("No se pudo enviar el correo de retraso:", err);
      }
    } else {
      await prisma.activityLog.create({
        data: {
          userId: 0,
          action: "NOTIFY_SKIPPED",
          entity: "Window",
          entityId: window.id,
          detail: `Sin destinatarios configurados para el evento ${event}`,
        },
      });
    }
  }
}
