import { useEffect, useMemo, useRef } from "react";
import FullCalendar from "@fullcalendar/react";
import resourceTimelinePlugin from "@fullcalendar/resource-timeline";
import interactionPlugin from "@fullcalendar/interaction";
import { format } from "date-fns";
import type { WindowStatus } from "@prisma/client";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { WINDOW_STATUS_COLOR, WINDOW_STATUS_LABEL } from "~/lib/windowStatus";

const DEFAULT_MIN_HOUR = 7;
const DEFAULT_MAX_HOUR = 17;

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
  status: WindowStatus;
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

  // El rango visible se expande si hay ventanas fuera del horario base —
  // una ventana de las 18:00 no debe quedar invisible en el calendario.
  const { slotMinTime, slotMaxTime } = useMemo(() => {
    let minHour = DEFAULT_MIN_HOUR;
    let maxHour = DEFAULT_MAX_HOUR;
    for (const e of events) {
      const start = new Date(e.start);
      const end = new Date(e.end);
      if (!Number.isNaN(start.getTime())) {
        minHour = Math.min(minHour, start.getHours());
      }
      if (!Number.isNaN(end.getTime())) {
        maxHour = Math.max(
          maxHour,
          end.getHours() + (end.getMinutes() > 0 ? 1 : 0),
        );
      }
    }
    const pad = (h: number) => `${String(h).padStart(2, "0")}:00:00`;
    return { slotMinTime: pad(minHour), slotMaxTime: pad(Math.min(maxHour, 24)) };
  }, [events]);

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
            color: WINDOW_STATUS_COLOR[e.status] ?? WINDOW_STATUS_COLOR.SCHEDULED,
            extendedProps: { status: e.status },
          }))}
          eventClick={(info) => onEventClick(info.event.id)}
          eventContent={(arg) => {
            const status = arg.event.extendedProps.status as
              | WindowStatus
              | undefined;
            return (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="fc-event-title fc-sticky w-full cursor-pointer truncate">
                    {arg.event.title}
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  {arg.event.title}
                  {status ? ` — ${WINDOW_STATUS_LABEL[status]}` : null}
                </TooltipContent>
              </Tooltip>
            );
          }}
          datesSet={(arg) => onDateChange(format(arg.view.currentStart, "yyyy-MM-dd"))}
          height="100%"
          expandRows={true}
          slotMinTime={slotMinTime}
          slotMaxTime={slotMaxTime}
        />
      </div>
    </TooltipProvider>
  );
}
