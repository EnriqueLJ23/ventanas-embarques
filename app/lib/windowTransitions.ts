import type { WindowStatus } from "@prisma/client";

export function canArrive(status: WindowStatus): boolean {
  return status === "SCHEDULED";
}

export function canStart(status: WindowStatus): boolean {
  return status === "SCHEDULED" || status === "ARRIVED";
}
