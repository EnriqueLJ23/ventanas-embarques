import type { ReactNode } from "react";
import { Card, CardContent } from "~/components/ui/card";

export function TableCard({ children }: { children: ReactNode }) {
  return (
    <Card>
      <CardContent className="p-0">{children}</CardContent>
    </Card>
  );
}
