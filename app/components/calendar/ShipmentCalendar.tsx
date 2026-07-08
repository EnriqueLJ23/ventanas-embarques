import { useEffect, useRef } from "react";
import FullCalendar from "@fullcalendar/react";
import resourceTimelinePlugin from "@fullcalendar/resource-timeline";
import interactionPlugin from "@fullcalendar/interaction";
import { format } from "date-fns";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";

const STATUS_COLORS: Record<string, string> = {
  SCHEDULED: "#64748b",
  ARRIVED: "#d97706",
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
  date,
  onDateChange,
  onEventClick,
}: {
  resources: CalendarResource[];
  events: CalendarEvent[];
  date: string;
  onDateChange: (date: string) => void;
  onEventClick: (id: string) => void;
}) {
  const calendarRef = useRef<FullCalendar>(null);

  useEffect(() => {
    calendarRef.current?.getApi().gotoDate(date);
  }, [date]);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="h-full min-h-[420px]">
        <FullCalendar
          ref={calendarRef}
          schedulerLicenseKey="CC-Attribution-NonCommercial-NoDerivatives"
          plugins={[resourceTimelinePlugin, interactionPlugin]}
          initialView="resourceTimelineDay"
          initialDate={date}
          resources={resources}
          resourceAreaWidth="120px"
          events={events.map((e) => ({
            id: e.id,
            resourceId: e.resourceId,
            title: e.title,
            start: e.start,
            end: e.end,
            color: STATUS_COLORS[e.status] ?? STATUS_COLORS.SCHEDULED,
          }))}
          eventClick={(info) => onEventClick(info.event.id)}
          eventContent={(arg) => (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="fc-event-title fc-sticky w-full cursor-pointer truncate">
                  {arg.event.title}
                </div>
              </TooltipTrigger>
              <TooltipContent>{arg.event.title}</TooltipContent>
            </Tooltip>
          )}
          datesSet={(arg) => onDateChange(format(arg.view.currentStart, "yyyy-MM-dd"))}
          height="100%"
          expandRows={true}
          slotMinTime="07:00:00"
          slotMaxTime="17:00:00"
        />
      </div>
    </TooltipProvider>
  );
}
