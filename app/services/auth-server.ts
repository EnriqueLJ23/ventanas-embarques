import { prisma } from "~/lib/db.server";

export async function findRegisteredUser(email: string) {
  return prisma.user.findUnique({ where: { email } });
}
