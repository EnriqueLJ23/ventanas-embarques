import { Link, Outlet, useLoaderData } from "react-router";
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
        <div className="flex items-center gap-4">
          <span className="font-medium">{user.email}</span>
          <nav className="flex gap-4 text-sm">
            <Link to="/">Inicio</Link>
            <Link to="/calendar">Calendario</Link>
            {(user.role === "VENTAS" || user.role === "ADMINISTRADOR") && (
              <Link to="/windows/new">Nueva ventana</Link>
            )}
            {user.role === "ADMINISTRADOR" && (
              <>
                <Link to="/reports">Reportes</Link>
                <Link to="/admin/warehouses">Naves</Link>
                <Link to="/admin/clients">Clientes</Link>
                <Link to="/admin/tiers">Tiers</Link>
                <Link to="/admin/users">Usuarios</Link>
                <Link to="/admin/overrides">Excepciones</Link>
                <Link to="/admin/activity">Actividad</Link>
              </>
            )}
          </nav>
        </div>
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
