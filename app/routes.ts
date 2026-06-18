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
] satisfies RouteConfig;
