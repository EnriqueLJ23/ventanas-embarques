import FullCalendar from "@fullcalendar/react";
import resourceTimelinePlugin from "@fullcalendar/resource-timeline";
import interactionPlugin from "@fullcalendar/interaction";

const STATUS_COLORS: Record<string, string> = {
  SCHEDULED: "#64748b",
  IN_PROGRESS: "#2563eb",
  COMPLETED: "#16a34a",
  CANCELLED: "#dc2626",
};

export interface CalendarResource {
  id: string;
  title: string;
}

export interface CalendarEvent {
  id: string;
  resourceId: string;
  title: string;
  start: string;
  end: string;
  status: string;
}

export function ShipmentCalendar({
  resources,
  events,
  onEventClick,
}: {
  resources: CalendarResource[];
  events: CalendarEvent[];
  onEventClick: (id: string) => void;
}) {
  return (
    <FullCalendar
      plugins={[resourceTimelinePlugin, interactionPlugin]}
      initialView="resourceTimelineDay"
      resources={resources}
      events={events.map((e) => ({
        id: e.id,
        resourceId: e.resourceId,
        title: e.title,
        start: e.start,
        end: e.end,
        color: STATUS_COLORS[e.status] ?? STATUS_COLORS.SCHEDULED,
      }))}
      eventClick={(info) => onEventClick(info.event.id)}
      height="auto"
      slotMinTime="06:00:00"
      slotMaxTime="22:00:00"
    />
  );
}
