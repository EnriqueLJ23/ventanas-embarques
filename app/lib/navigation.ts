const STATIC_LABELS: [prefix: string, label: string][] = [
  ["/calendar", "Calendario"],
  ["/reports", "Reportes"],
  ["/admin/warehouses", "Naves"],
  ["/admin/clients", "Clientes"],
  ["/admin/tiers", "Tiers"],
  ["/admin/users", "Usuarios"],
  ["/admin/overrides", "Excepciones"],
  ["/admin/activity", "Actividad"],
  ["/windows", "Detalle de ventana"],
];

export function getPageTitle(pathname: string): string {
  if (pathname === "/") return "Inicio";
  const match = STATIC_LABELS.find(([prefix]) => pathname.startsWith(prefix));
  return match ? match[1] : "Inicio";
}
