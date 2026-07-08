import { Outlet, useLoaderData, useLocation } from "react-router";
import type { Route } from "./+types/dashboard";
import type { Role } from "@prisma/client";

import { requireUser } from "~/lib/session.server";
import { prisma } from "~/lib/db.server";
import { OverrideBadge } from "~/components/admin/OverrideBadge";
import { AppSidebar } from "~/components/layout/AppSidebar";
import { UserMenu } from "~/components/layout/UserMenu";
import { getPageTitle } from "~/lib/navigation";
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from "~/components/ui/sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "~/components/ui/breadcrumb";
import { Separator } from "~/components/ui/separator";
import { TooltipProvider } from "~/components/ui/tooltip";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const pendingOverrideCount =
    user.role === "ADMINISTRADOR"
      ? await prisma.overrideRequest.count({ where: { status: "PENDING" } })
      : 0;
  return { user, pendingOverrideCount };
}

// Roles that only ever interact with a single home screen (plus drill-in detail
// pages) get a bare header instead of the full admin sidebar/nav.
const ROLE_HOME: Partial<Record<Role, { to: string; label: string }>> = {
  ALMACEN: { to: "/", label: "Inicio" },
  VENTAS: { to: "/calendar", label: "Calendario" },
  GUARDIA: { to: "/", label: "Inicio" },
};

export default function Dashboard() {
  const { user, pendingOverrideCount } = useLoaderData<typeof loader>();
  const { pathname } = useLocation();
  const pageTitle = getPageTitle(pathname);
  const home = ROLE_HOME[user.role];

  if (home) {
    const atHome = pathname === home.to;
    return (
      <div className="flex min-h-svh flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b bg-background/80 px-4 backdrop-blur-xl">
          <div className="flex items-center gap-2">
            {!atHome && (
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbLink href={home.to}>{home.label}</BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage>{pageTitle}</BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            )}
          </div>
          <UserMenu email={user.email} />
        </header>
        <main className="flex-1 min-h-0 overflow-y-auto bg-muted/15 p-6 md:p-8">
          <div className="mx-auto flex h-full max-w-6xl flex-col">
            <Outlet />
          </div>
        </main>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b bg-background/80 px-4 backdrop-blur-xl">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="-ml-1" />
              <Separator orientation="vertical" className="h-4" />
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbLink href="/">Inicio</BreadcrumbLink>
                  </BreadcrumbItem>
                  {pageTitle !== "Inicio" && (
                    <>
                      <BreadcrumbSeparator />
                      <BreadcrumbItem>
                        <BreadcrumbPage>{pageTitle}</BreadcrumbPage>
                      </BreadcrumbItem>
                    </>
                  )}
                </BreadcrumbList>
              </Breadcrumb>
            </div>
            <div className="flex items-center gap-3">
              <OverrideBadge count={pendingOverrideCount} />
              <UserMenu email={user.email} />
            </div>
          </header>
          <main className="flex-1 min-h-0 overflow-y-auto bg-muted/15 p-6 md:p-8">
            <div className="mx-auto flex h-full max-w-6xl flex-col">
              <Outlet />
            </div>
          </main>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
