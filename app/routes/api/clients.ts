import type { Route } from "./+types/clients";
import { requireUser } from "~/lib/session.server";
import { prisma } from "~/lib/db.server";

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request);
  const clients = await prisma.client.findMany({
    where: { active: true },
    include: { tier: true },
    orderBy: { name: "asc" },
  });
  return Response.json(clients);
}

export async function action({ request }: Route.ActionArgs) {
  await requireUser(request, ["ADMINISTRADOR"]);
  const body = await request.json();
  const client = await prisma.client.create({
    data: {
      name: body.name,
      tierId: body.tierId,
      avgLoadTime: Number(body.avgLoadTime),
      preferredWarehouse: body.preferredWarehouse ?? null,
      defaultArrivalTime: body.defaultArrivalTime ?? null,
    },
  });
  return Response.json(client, { status: 201 });
}
