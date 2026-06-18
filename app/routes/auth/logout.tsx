import { logout } from "~/lib/session.server";
import type { Route } from "./+types/logout";

export async function action({ request }: Route.ActionArgs) {
  return logout(request);
}

export default function LogoutRoute() {
  return null;
}
