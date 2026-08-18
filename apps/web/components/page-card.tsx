import { cn } from "@/lib/cn";
import { ScrollFade } from "@/components/scroll-fade";

/** svgl-style bordered card that scrolls internally; the page never scrolls.
 *  Top fade is transparent (svgl's pageCard config): the sticky toolbar owns
 *  that edge, so nothing washes it out. */
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
        <ScrollFade
          fadeHeight={50}
          topClassName="from-transparent"
          bottomClassName="from-white dark:from-[#0f0f0f]"
          viewportClassName={cn(
            withSearch
              ? "max-h-[calc(100vh-7.6rem)] min-h-[calc(100vh-7.6rem)]"
              : "max-h-[calc(100vh-4.5rem)] min-h-[calc(100vh-4.5rem)]"
          )}
        >
          {children}
        </ScrollFade>
      </div>
    </div>
  );
}
