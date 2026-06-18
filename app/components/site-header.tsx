import { SearchForm } from "~/components/search-form";
import { Button } from "~/components/ui/button";
import { Separator } from "~/components/ui/separator";
import { useSidebar } from "~/components/ui/sidebar";
import { CalendarIcon, PanelLeftIcon } from "lucide-react";

export function SiteHeader() {
  const { toggleSidebar } = useSidebar();

  return (
    <header className="header-area sticky top-0 z-50 flex w-full items-center border-b bg-primary text-primary-foreground">
      <div className="flex h-(--header-height) w-full items-center px-4">
        <div className="flex shrink-0 items-center gap-2">
          <Button
            className="h-8 w-8"
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
          >
            <PanelLeftIcon />
          </Button>
          <Separator
            orientation="vertical"
            className="mx-1 data-vertical:h-4 data-vertical:self-auto"
          />
          <div className="flex items-center gap-1.5">
            <CalendarIcon className="size-4" />
            <span className="text-sm font-semibold">Reminder Scheduler</span>
          </div>
        </div>

        <div className="flex flex-1 justify-center px-6">
          <SearchForm className="w-full max-w-xl" />
        </div>

        <div className="shrink-0" style={{ width: "180px" }} />
      </div>
    </header>
  );
}
