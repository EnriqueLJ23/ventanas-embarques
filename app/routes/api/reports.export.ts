import ExcelJS from "exceljs";
import type { Route } from "./+types/reports.export";
import { requireUser } from "~/lib/session.server";
import { prisma } from "~/lib/db.server";

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request, ["ADMINISTRADOR"]);
  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  const windows = await prisma.window.findMany({
    where: from && to ? { scheduledStart: { gte: new Date(from), lte: new Date(to) } } : {},
    include: { client: true, warehouse: true, delayReasonCategory: true },
    orderBy: { scheduledStart: "asc" },
  });

  const workbook = new ExcelJS.Workbook();

  const summarySheet = workbook.addWorksheet("Resumen");
  summarySheet.addRow(["Cliente", "Tiempo promedio real (min)", "Tiempo estimado (min)", "Retardos"]);
  const byClient = new Map<string, { actualSum: number; actualCount: number; estimated: number; delays: number }>();
  for (const w of windows) {
    const entry = byClient.get(w.client.name) ?? { actualSum: 0, actualCount: 0, estimated: w.client.avgLoadTime, delays: 0 };
    if (w.actualStart && w.actualEnd) {
      entry.actualSum += (w.actualEnd.getTime() - w.actualStart.getTime()) / 60000;
      entry.actualCount += 1;
    }
    if (w.delayReasonCategory) entry.delays += 1;
    byClient.set(w.client.name, entry);
  }
  for (const [name, v] of byClient) {
    summarySheet.addRow([name, v.actualCount ? Math.round(v.actualSum / v.actualCount) : "", v.estimated, v.delays]);
  }

  const detailSheet = workbook.addWorksheet("Detalle de ventanas");
  detailSheet.addRow([
    "ID", "Cliente", "Nave", "Tipo", "Inicio programado", "Fin programado",
    "Inicio real", "Fin real", "Operador", "Placas", "Rollos", "Estado", "Motivo de retraso", "Detalle",
  ]);
  for (const w of windows) {
    detailSheet.addRow([
      w.id, w.client.name, w.warehouse.name, w.type,
      w.scheduledStart.toISOString(), w.scheduledEnd.toISOString(),
      w.actualStart?.toISOString() ?? "", w.actualEnd?.toISOString() ?? "",
      w.operatorName, w.licensePlate, w.rollsCount ?? "", w.status,
      w.delayReasonCategory?.label ?? "",
      w.delayReason ?? "",
    ]);
  }

  const delaysSheet = workbook.addWorksheet("Retardos y motivos");
  delaysSheet.addRow(["Cliente", "Nave", "Fecha", "Motivo", "Detalle"]);
  for (const w of windows.filter((w) => w.delayReasonCategory)) {
    delaysSheet.addRow([
      w.client.name,
      w.warehouse.name,
      w.scheduledStart.toISOString(),
      w.delayReasonCategory!.label,
      w.delayReason ?? "",
    ]);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": "attachment; filename=reporte-ventanas.xlsx",
    },
  });
}
