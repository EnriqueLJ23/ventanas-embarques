export const DELAY_THRESHOLDS_MINUTES = [15, 30, 45, 60] as const;

export function getDelayThresholdToNotify(
  elapsedMinutes: number,
  lastNotified: number | null
): number | null {
  const applicable = DELAY_THRESHOLDS_MINUTES.filter((t) => elapsedMinutes >= t);
  if (applicable.length === 0) return null;
  const highest = applicable[applicable.length - 1];
  if (lastNotified !== null && lastNotified >= highest) return null;
  return highest;
}
