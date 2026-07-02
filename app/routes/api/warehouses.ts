import type { Route } from "./+types/warehouses";
import { requireUser } from "~/lib/session.server";
import { prisma } from "~/lib/db.server";

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request);
  const warehouses = await prisma.warehouse.findMany({ orderBy: { name: "asc" } });
  return Response.json(warehouses);
}

export async function action({ request }: Route.ActionArgs) {
  await requireUser(request, ["ADMINISTRADOR"]);
  const body = await request.json();

  if (request.method === "PATCH") {
    const warehouse = await prisma.warehouse.update({
      where: { id: body.id },
      data: {
        name: body.name ?? undefined,
        code: body.code ?? undefined,
        active: body.active ?? undefined,
      },
    });
    return Response.json(warehouse);
  }

  const warehouse = await prisma.warehouse.create({
    data: { name: body.name, code: body.code },
  });
  return Response.json(warehouse, { status: 201 });
}
