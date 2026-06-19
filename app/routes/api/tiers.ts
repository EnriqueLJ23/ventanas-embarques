import type { Route } from "./+types/tiers";
import { requireUser } from "~/lib/session.server";
import { prisma } from "~/lib/db.server";

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request);
  const tiers = await prisma.tier.findMany({ orderBy: { priority: "asc" } });
  return Response.json(tiers);
}

export async function action({ request }: Route.ActionArgs) {
  await requireUser(request, ["ADMINISTRADOR"]);
  const body = await request.json();
  const tier = await prisma.tier.create({
    data: { name: body.name, priority: body.priority, description: body.description ?? null },
  });
  return Response.json(tier, { status: 201 });
}
