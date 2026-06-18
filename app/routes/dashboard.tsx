import { Outlet, useLoaderData } from "react-router";
import type { Route } from "./+types/dashboard";

import { logout, requireUserId } from "~/lib/session.server";
import { prisma } from "~/lib/db.server";
import { startBoss } from "~/services/boss.server";

export async function loader({ request }: Route.LoaderArgs) {
  const userId = await requireUserId(request);
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw await logout(request);
  }
  // Start the pg-boss worker on first request (no-op if already running)
  await startBoss();
  return { user };
}

export default function Dashboard() {
  useLoaderData<typeof loader>();

  return (
    <div>
      <Outlet />
    </div>
  );
}
