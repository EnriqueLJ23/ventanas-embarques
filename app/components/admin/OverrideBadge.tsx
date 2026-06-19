import { Link } from "react-router";
import { Badge } from "~/components/ui/badge";

export function OverrideBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <Link to="/admin/overrides">
      <Badge variant="destructive">
        {count} solicitud{count === 1 ? "" : "es"} pendiente{count === 1 ? "" : "s"}
      </Badge>
    </Link>
  );
}
