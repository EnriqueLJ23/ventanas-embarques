import type { Route } from "./+types/users";
import { requireUser } from "~/lib/session.server";
import { prisma } from "~/lib/db.server";

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request, ["ADMINISTRADOR"]);
  const users = await prisma.user.findMany({ orderBy: { name: "asc" } });
  return Response.json(users);
}

export async function action({ request }: Route.ActionArgs) {
  await requireUser(request, ["ADMINISTRADOR"]);
  if (request.method === "PATCH") {
    const body = await request.json();
    const user = await prisma.user.update({
      where: { id: Number(body.id) },
      data: { role: body.role, active: body.active },
    });
    return Response.json(user);
  }
  const body = await request.json();
  const user = await prisma.user.create({
    data: { email: body.email, name: body.name, role: body.role },
  });
  return Response.json(user, { status: 201 });
}
