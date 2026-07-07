import type { Route } from "./+types/clients";
import { requireUser } from "~/lib/session.server";
import { prisma } from "~/lib/db.server";

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request);
  const clients = await prisma.client.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
  });
  return Response.json(clients);
}

export async function action({ request }: Route.ActionArgs) {
  await requireUser(request, ["ADMINISTRADOR"]);
  const body = await request.json();

  if (request.method === "PATCH") {
    const client = await prisma.client.update({
      where: { id: body.id },
      data: {
        name: body.name,
        avgLoadTime: Number(body.avgLoadTime),
        preferredWarehouseId: body.preferredWarehouseId ?? null,
        defaultArrivalTime: body.defaultArrivalTime ?? null,
        active: body.active ?? undefined,
      },
    });
    return Response.json(client);
  }

  const client = await prisma.client.create({
    data: {
      name: body.name,
      avgLoadTime: Number(body.avgLoadTime),
      preferredWarehouseId: body.preferredWarehouseId ?? null,
      defaultArrivalTime: body.defaultArrivalTime ?? null,
    },
  });
  return Response.json(client, { status: 201 });
}
