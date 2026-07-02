import type { ComponentType } from "react";
import { Inbox } from "lucide-react";

export function EmptyState({
  message,
  icon: Icon = Inbox,
}: {
  message: string;
  icon?: ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      <Icon className="size-8 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
