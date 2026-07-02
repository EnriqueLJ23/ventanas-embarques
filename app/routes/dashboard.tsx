import { Outlet, useLoaderData, useLocation } from "react-router";
import type { Route } from "./+types/dashboard";

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

export default function Dashboard() {
  const { user, pendingOverrideCount } = useLoaderData<typeof loader>();
  const { pathname } = useLocation();
  const pageTitle = getPageTitle(pathname);

  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar role={user.role} />
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
          <main className="flex-1 bg-muted/15 p-6 md:p-8">
            <div className="mx-auto max-w-6xl">
              <Outlet />
            </div>
          </main>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
