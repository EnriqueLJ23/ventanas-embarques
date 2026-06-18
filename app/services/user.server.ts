import { prisma } from "~/lib/db.server";

export async function getUsers() {
  return prisma.user.findMany();
}
