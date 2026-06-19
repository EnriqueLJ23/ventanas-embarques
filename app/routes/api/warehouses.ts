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
  const warehouse = await prisma.warehouse.create({
    data: { name: body.name, code: body.code },
  });
  return Response.json(warehouse, { status: 201 });
}
