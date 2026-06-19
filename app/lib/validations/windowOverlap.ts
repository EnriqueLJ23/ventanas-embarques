export function rangesOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date
): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

export interface OverlapCandidate {
  warehouseId: string;
  scheduledStart: Date;
  scheduledEnd: Date;
  excludeId?: string;
}

export interface ExistingWindow {
  id: string;
  warehouseId: string;
  scheduledStart: Date;
  scheduledEnd: Date;
  status: string;
}

export function findOverlappingWindow(
  candidate: OverlapCandidate,
  existing: ExistingWindow[]
): ExistingWindow | null {
  for (const w of existing) {
    if (w.warehouseId !== candidate.warehouseId) continue;
    if (candidate.excludeId && w.id === candidate.excludeId) continue;
    if (
      rangesOverlap(
        candidate.scheduledStart,
        candidate.scheduledEnd,
        w.scheduledStart,
        w.scheduledEnd
      )
    ) {
      return w;
    }
  }
  return null;
}
