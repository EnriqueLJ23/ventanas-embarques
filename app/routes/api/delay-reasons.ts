import type { Route } from "./+types/delay-reasons";
import { requireUser } from "~/lib/session.server";
import { prisma } from "~/lib/db.server";

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request);
  const reasons = await prisma.delayReason.findMany({ orderBy: { label: "asc" } });
  return Response.json(reasons);
}

export async function action({ request }: Route.ActionArgs) {
  await requireUser(request, ["ADMINISTRADOR"]);
  const body = await request.json();

  if (request.method === "PATCH") {
    const reason = await prisma.delayReason.update({
      where: { id: body.id },
      data: {
        label: body.label ?? undefined,
        active: body.active ?? undefined,
      },
    });
    return Response.json(reason);
  }

  const reason = await prisma.delayReason.create({ data: { label: body.label } });
  return Response.json(reason, { status: 201 });
}
