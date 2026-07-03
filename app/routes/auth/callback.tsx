import { redirect } from "react-router";

import type { Route } from "./+types/callback";

import { msalClient, REDIRECT_URI } from "~/lib/microsoft.server";

import { createUserSession } from "~/lib/session.server";
import { prisma } from "~/lib/db.server";

import { findRegisteredUser } from "~/services/auth-server";

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

  const user = await findRegisteredUser(email);

  if (!user) {
    throw redirect("/login?error=not_registered");
  }

  if (!user.name && response.accessToken) {
    try {
      const meRes = await fetch("https://graph.microsoft.com/v1.0/me", {
        headers: { Authorization: `Bearer ${response.accessToken}` },
      });
      if (meRes.ok) {
        const me = await meRes.json();
        if (me.displayName) {
          await prisma.user.update({ where: { id: user.id }, data: { name: me.displayName } });
        }
      }
    } catch (err) {
      console.error("No se pudo obtener displayName de Graph:", err);
    }
  }

  return createUserSession(user.id, "/");
}

export default function CallbackPage() {
  return null;
}
