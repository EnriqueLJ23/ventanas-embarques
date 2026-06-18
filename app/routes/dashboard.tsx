import { Outlet, useLoaderData } from "react-router";
import type { Route } from "./+types/dashboard";

import { logout, requireUserId } from "~/lib/session.server";
import { prisma } from "~/lib/db.server";
import { startBoss } from "~/services/boss.server";
import { AppSidebar } from "~/components/app-sidebar";
import { SiteHeader } from "~/components/site-header";
import { SidebarInset, SidebarProvider } from "~/components/ui/sidebar";

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
  const { user } = useLoaderData<typeof loader>();

  return (
    <div className="[--header-height:calc(--spacing(14))]">
      <SidebarProvider className="flex flex-col">
        <SiteHeader />
        <div className="flex flex-1">
          <AppSidebar user={user} />
          <SidebarInset>
            <div className="flex flex-1 flex-col gap-4 p-4">
              <Outlet />
            </div>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </div>
  );
}
