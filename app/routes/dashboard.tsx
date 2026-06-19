import { Outlet, useLoaderData } from "react-router";
import type { Route } from "./+types/dashboard";

import { requireUser } from "~/lib/session.server";
import { prisma } from "~/lib/db.server";
import { OverrideBadge } from "~/components/admin/OverrideBadge";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const pendingOverrideCount =
    user.role === "ADMINISTRADOR"
      ? await prisma.overrideRequest.count({ where: { status: "PENDING" } })
      : 0;
  return { user, pendingOverrideCount };
}

export default function Dashboard() {
  const { user, pendingOverrideCount } = useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between p-4 border-b">
        <span className="font-medium">{user.email}</span>
        <div className="flex items-center gap-3">
          <OverrideBadge count={pendingOverrideCount} />
          <form method="post" action="/logout">
            <button type="submit" className="border px-3 py-1 rounded hover:bg-gray-50">
              Cerrar sesión
            </button>
          </form>
        </div>
      </header>
      <main className="flex-1 p-4">
        <Outlet />
      </main>
    </div>
  );
}
