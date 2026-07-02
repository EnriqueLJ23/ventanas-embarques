import { Link, useLocation } from "react-router";
import {
  CalendarRange,
  ClipboardList,
  History,
  Home,
  LayoutGrid,
  ShieldCheck,
  Users,
  Warehouse,
} from "lucide-react";
import type { Role } from "@prisma/client";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
} from "~/components/ui/sidebar";

type NavItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const operationItems: NavItem[] = [
  { to: "/", label: "Inicio", icon: Home },
  { to: "/calendar", label: "Calendario", icon: CalendarRange },
];

const adminItems: NavItem[] = [
  { to: "/admin/warehouses", label: "Naves", icon: Warehouse },
  { to: "/admin/clients", label: "Clientes", icon: Users },
  { to: "/admin/tiers", label: "Tiers", icon: LayoutGrid },
  { to: "/admin/users", label: "Usuarios", icon: ShieldCheck },
  { to: "/admin/overrides", label: "Excepciones", icon: ClipboardList },
  { to: "/admin/activity", label: "Actividad", icon: History },
];

const ROLE_LABEL: Record<Role, string> = {
  VENTAS: "Ventas",
  CARGA: "Carga",
  DESCARGA: "Descarga",
  ADMINISTRADOR: "Administrador",
};

function NavLinkItem({ item, pathname }: { item: NavItem; pathname: string }) {
  const isActive =
    item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild data-active={isActive} tooltip={item.label}>
        <Link to={item.to}>
          <item.icon className="size-4" />
          <span>{item.label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export function AppSidebar({ role }: { role: Role }) {
  const { pathname } = useLocation();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-2">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Warehouse className="size-4" />
          </div>
          <div className="flex flex-col leading-tight group-data-[collapsible=icon]:hidden">
            <span className="text-sm font-semibold">Ventanas</span>
            <span className="text-xs text-muted-foreground">de Embarque</span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Operación</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {operationItems.map((item) => (
                <NavLinkItem key={item.to} item={item} pathname={pathname} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {role === "ADMINISTRADOR" && (
          <>
            <SidebarSeparator />
            <SidebarGroup>
              <SidebarGroupLabel>Administración</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {adminItems.map((item) => (
                    <NavLinkItem key={item.to} item={item} pathname={pathname} />
                  ))}
                  <NavLinkItem
                    item={{ to: "/reports", label: "Reportes", icon: LayoutGrid }}
                    pathname={pathname}
                  />
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}
      </SidebarContent>
      <SidebarFooter>
        <div className="px-2 py-1.5 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
          Rol: <span className="font-medium text-foreground">{ROLE_LABEL[role]}</span>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
