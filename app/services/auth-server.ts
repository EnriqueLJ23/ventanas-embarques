import { prisma } from "~/lib/db.server";

export async function findOrCreateUser(email: string) {
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({ data: { email } });
  }
  return user;
}
