import { prisma } from "~/lib/db.server";

export async function logActivity(params: {
  userId: number;
  action: string;
  entity: string;
  entityId?: string;
  detail?: string;
}): Promise<void> {
  await prisma.activityLog.create({
    data: {
      userId: params.userId,
      action: params.action,
      entity: params.entity,
      entityId: params.entityId ?? null,
      detail: params.detail ?? null,
    },
  });
}
