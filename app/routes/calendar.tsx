import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import type { Route } from "./+types/calendar";
import { requireUser } from "~/lib/session.server";
import { Button } from "~/components/ui/button";
import {
  ShipmentCalendar,
  type CalendarEvent,
  type CalendarResource,
} from "~/components/calendar/ShipmentCalendar";
import { format } from "date-fns";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  return { role: user.role };
}

export default function Calendar({ loaderData }: Route.ComponentProps) {
  const { role } = loaderData;
  const navigate = useNavigate();
  const [resources, setResources] = useState<CalendarResource[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [date] = useState(format(new Date(), "yyyy-MM-dd"));

  useEffect(() => {
    fetch("/api/warehouses")
      .then((r) => r.json())
      .then((warehouses) =>
        setResources(warehouses.map((w: any) => ({ id: w.id, title: w.name })))
      );
  }, []);

  useEffect(() => {
    fetch(`/api/windows?date=${date}`)
      .then((r) => r.json())
      .then((windows) =>
        setEvents(
          windows.map((w: any) => ({
            id: w.id,
            resourceId: w.warehouseId,
            title: `${w.client.name} (${w.operatorName})`,
            start: w.scheduledStart,
            end: w.scheduledEnd,
            status: w.status,
          }))
        )
      );
  }, [date]);

  return (
    <div className="space-y-4 relative">
      <h1 className="text-2xl font-bold">Calendario de ventanas</h1>
      <ShipmentCalendar
        resources={resources}
        events={events}
        onEventClick={(id) => navigate(`/windows/${id}`)}
      />
      {(role === "VENTAS" || role === "ADMINISTRADOR") && (
        <Button className="fixed bottom-6 right-6" onClick={() => navigate("/windows/new")}>
          + Nueva Ventana
        </Button>
      )}
    </div>
  );
}
