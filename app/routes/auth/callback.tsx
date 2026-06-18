import { redirect } from "react-router";

import type { Route } from "./+types/callback";

import { msalClient, REDIRECT_URI } from "~/lib/microsoft.server";

import { createUserSession } from "~/lib/session.server";

import { findOrCreateUser } from "~/services/auth-server";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  if (!code) {
    throw redirect("/login");
  }

  const response = await msalClient.acquireTokenByCode({
    code,
    scopes: ["User.Read"],
    redirectUri: REDIRECT_URI,
  });

  const email = response.account?.username;

  if (!email) {
    throw redirect("/login");
  }

  const user = await findOrCreateUser(email);

  return createUserSession(user.id, "/");
}

export default function CallbackPage() {
  return null;
}
