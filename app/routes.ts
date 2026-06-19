import {
  type RouteConfig,
  index,
  route,
  layout,
} from "@react-router/dev/routes";

export default [
  layout("./routes/dashboard.tsx", [index("./routes/_root.tsx")]),

  layout("./routes/auth/layout.tsx", [
    route("login", "./routes/auth/login.tsx"),
    route("auth/callback", "./routes/auth/callback.tsx"),
  ]),

  route("logout", "./routes/auth/logout.tsx"),

  layout("./routes/admin/layout.tsx", [
    route("admin/warehouses", "./routes/admin/warehouses.tsx"),
    route("admin/tiers", "./routes/admin/tiers.tsx"),
    route("admin/clients", "./routes/admin/clients.tsx"),
    route("admin/users", "./routes/admin/users.tsx"),
  ]),

  route("api/warehouses", "./routes/api/warehouses.ts"),
  route("api/tiers", "./routes/api/tiers.ts"),
  route("api/clients", "./routes/api/clients.ts"),
  route("api/users", "./routes/api/users.ts"),
  route("api/windows", "./routes/api/windows.ts"),
  route("api/windows/conflicts", "./routes/api/windows.conflicts.ts"),
  route("api/windows/:id", "./routes/api/windows.$id.ts"),
  route("api/windows/:id/start", "./routes/api/windows.$id.start.ts"),
  route("api/windows/:id/complete", "./routes/api/windows.$id.complete.ts"),
] satisfies RouteConfig;
