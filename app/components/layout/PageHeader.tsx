import type { ReactNode } from "react";
import { cn } from "~/lib/utils";

export function PageHeader({
  title,
  description,
  action,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  if (!title && !action) return null;

  return (
    <div className={cn("flex items-start gap-4 pb-2", title ? "justify-between" : "justify-end")}>
      {title && (
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {description && (
            <p className="text-sm text-muted-foreground mt-1">{description}</p>
          )}
        </div>
      )}
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
