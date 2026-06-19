import { Outlet } from "react-router";
import type { Route } from "./+types/layout";
import { requireUser } from "~/lib/session.server";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request, ["ADMINISTRADOR"]);
  return { user };
}

export default function AdminLayout() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Administración</h1>
      <Outlet />
    </div>
  );
}
