import {
  type RouteConfig,
  index,
  route,
  layout,
} from "@react-router/dev/routes";

export default [
  layout("./routes/dashboard.tsx", [
    index("./routes/_root.tsx"),
    route("upcoming", "./routes/upcoming.tsx"),
    route("upcoming/:id", "./routes/upcoming-detail.tsx"),
    route("sent", "./routes/sent.tsx"),
    route("sent/:id", "./routes/sent-detail.tsx"),
    route("drafts/:id", "./routes/drafts-detail.tsx"),
    route("reminders/new", "./routes/new-reminder.tsx"),
    route("search", "./routes/search.tsx"),
  ]),

  layout("./routes/auth/layout.tsx", [
    route("login", "./routes/auth/login.tsx"),
    route("auth/callback", "./routes/auth/callback.tsx"),
  ]),

  route("logout", "./routes/auth/logout.tsx"),
  route("api/contacts/search", "./routes/api.contacts.search.tsx"),
  route("api/reminders/search", "./routes/api.reminders.search.tsx"),
] satisfies RouteConfig;
