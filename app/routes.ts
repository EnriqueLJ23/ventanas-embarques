import {
  type RouteConfig,
  index,
  route,
  layout,
} from "@react-router/dev/routes";

export default [
  layout("./routes/dashboard.tsx", [
    index("./routes/_root.tsx"),
    route("calendar", "./routes/calendar.tsx"),
    route("windows/new", "./routes/windows/new.tsx"),
    route("windows/:id", "./routes/windows/detail.tsx"),
    route("reports", "./routes/reports.tsx"),

    layout("./routes/admin/layout.tsx", [
      route("admin/warehouses", "./routes/admin/warehouses.tsx"),
      route("admin/tiers", "./routes/admin/tiers.tsx"),
      route("admin/clients", "./routes/admin/clients.tsx"),
      route("admin/users", "./routes/admin/users.tsx"),
      route("admin/overrides", "./routes/admin/overrides.tsx"),
      route("admin/activity", "./routes/admin/activity.tsx"),
    ]),
  ]),

  layout("./routes/auth/layout.tsx", [
    route("login", "./routes/auth/login.tsx"),
    route("auth/callback", "./routes/auth/callback.tsx"),
  ]),

  route("logout", "./routes/auth/logout.tsx"),

  route("api/warehouses", "./routes/api/warehouses.ts"),
  route("api/tiers", "./routes/api/tiers.ts"),
  route("api/clients", "./routes/api/clients.ts"),
  route("api/users", "./routes/api/users.ts"),
  route("api/windows", "./routes/api/windows.ts"),
  route("api/windows/conflicts", "./routes/api/windows.conflicts.ts"),
  route("api/windows/:id", "./routes/api/windows.$id.ts"),
  route("api/windows/:id/arrive", "./routes/api/windows.$id.arrive.ts"),
  route("api/windows/:id/start", "./routes/api/windows.$id.start.ts"),
  route("api/windows/:id/complete", "./routes/api/windows.$id.complete.ts"),
  route("api/overrides", "./routes/api/overrides.ts"),
  route("api/overrides/:id", "./routes/api/overrides.$id.ts"),
  route("api/reports/summary", "./routes/api/reports.summary.ts"),
  route("api/reports/export", "./routes/api/reports.export.ts"),
] satisfies RouteConfig;
