import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Scroll-aware edge fades (SVGL's ScrollArea mask pattern, MIT —
 *  pheralb/svgl scroll-area.svelte + scroll-area-mask.svelte): overlay
 *  gradients instead of a CSS mask, shown only when content is actually
 *  scrolled off that edge — the top fade is invisible at scrollTop 0, so
 *  the first item is never obscured. Fade colors are passed per surface;
 *  `from-transparent` disables an edge (their page-card top). */
export function ScrollFade({
  className,
  viewportClassName,
  topClassName = "from-neutral-100 dark:from-neutral-950",
  bottomClassName = "from-neutral-100 dark:from-neutral-950",
  fadeHeight = 40,
  children,
}: {
  className?: string;
  viewportClassName?: string;
  topClassName?: string;
  bottomClassName?: string;
  fadeHeight?: number;
  children: ReactNode;
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [mask, setMask] = useState({ top: false, bottom: false });

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const check = () => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      setMask({
        top: scrollTop > 0,
        bottom: scrollTop + clientHeight < scrollHeight - 1,
      });
    };
    const ro = new ResizeObserver(check);
    ro.observe(el);
    el.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    check();
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
  }, []);

  const fade =
    "pointer-events-none absolute inset-x-0 z-10 transition-opacity duration-300";

  return (
    <div className={cn("relative overflow-hidden", className)}>
      <div ref={viewportRef} className={cn("h-full overflow-y-auto", viewportClassName)}>
        {children}
      </div>
      <div
        aria-hidden="true"
        style={{ height: fadeHeight }}
        className={cn(
          fade,
          "top-0 bg-gradient-to-b to-transparent",
          topClassName,
          mask.top ? "opacity-100" : "opacity-0"
        )}
      />
      <div
        aria-hidden="true"
        style={{ height: fadeHeight }}
        className={cn(
          fade,
          "bottom-0 bg-gradient-to-t to-transparent",
          bottomClassName,
          mask.bottom ? "opacity-100" : "opacity-0"
        )}
      />
    </div>
  );
}
