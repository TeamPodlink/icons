import { cn } from "@/lib/cn";

/** svgl-style bordered card that scrolls internally; the page never scrolls. */
export function PageCard({
  children,
  withSearch = false,
}: {
  children: React.ReactNode;
  withSearch?: boolean;
}) {
  return (
    <div className="p-px">
      <div className="shadow-xs overflow-hidden rounded-md border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900/40">
        <div
          className={cn(
            "scroll-mask overflow-y-auto",
            withSearch
              ? "max-h-[calc(100vh-7.6rem)] min-h-[calc(100vh-7.6rem)]"
              : "max-h-[calc(100vh-4.5rem)] min-h-[calc(100vh-4.5rem)]"
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
