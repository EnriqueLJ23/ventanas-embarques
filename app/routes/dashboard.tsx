import { Outlet, useLoaderData } from "react-router";
import type { Route } from "./+types/dashboard";

import { logout, requireUserId } from "~/lib/session.server";
import { prisma } from "~/lib/db.server";

export async function loader({ request }: Route.LoaderArgs) {
  const userId = await requireUserId(request);
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw await logout(request);
  }
  return { user };
}

export default function Dashboard() {
  const { user } = useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between p-4 border-b">
        <span className="font-medium">{user.email}</span>
        <form method="post" action="/logout">
          <button type="submit" className="border px-3 py-1 rounded hover:bg-gray-50">
            Cerrar sesión
          </button>
        </form>
      </header>
      <main className="flex-1 p-4">
        <Outlet />
      </main>
    </div>
  );
}
