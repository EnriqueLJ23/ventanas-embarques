import { data } from "react-router";
import type { Route } from "./+types/api.contacts.search";

import { requireUserId } from "~/lib/session.server";
import { searchEntraUsers } from "~/services/email.server";

export async function loader({ request }: Route.LoaderArgs) {
  await requireUserId(request);
  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? "";
  const users = await searchEntraUsers(q);
  return data({ users });
}
