import type { Route } from "./+types/users.search";
import { requireUser } from "~/lib/session.server";
import { getAppAccessToken } from "~/lib/microsoft.server";

interface GraphUser {
  displayName?: string;
  mail?: string;
  userPrincipalName?: string;
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request, ["ADMINISTRADOR"]);
  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim();
  if (!q || q.length < 2) return Response.json({ results: [] });

  let token: string;
  try {
    token = await getAppAccessToken();
  } catch (err) {
    console.error("No se pudo obtener token de aplicación para Graph:", err);
    return Response.json({ results: [], error: "graph_unavailable" });
  }

  const search = encodeURIComponent(`"displayName:${q}" OR "mail:${q}"`);
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users?$search=${search}&$select=displayName,mail,userPrincipalName&$top=10`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        ConsistencyLevel: "eventual",
      },
    }
  );

  if (!res.ok) {
    console.error("Graph user search failed:", res.status, await res.text());
    return Response.json({ results: [], error: "graph_unavailable" });
  }

  const data = (await res.json()) as { value?: GraphUser[] };
  const results = (data.value ?? [])
    .map((u) => ({ name: u.displayName ?? "", email: u.mail ?? u.userPrincipalName ?? "" }))
    .filter((u) => u.email);

  return Response.json({ results });
}
