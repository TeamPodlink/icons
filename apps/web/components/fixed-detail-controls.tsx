import { useLayoutEffect, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

/** Keep secondary controls below the facet switcher, outside artwork layout. */
export function FixedDetailControls({ anchor, children }: {
  anchor: RefObject<HTMLDivElement | null>;
  children: ReactNode;
}) {
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const element = anchor.current;
    if (!element) return;
    const update = () => {
      const bounds = element.getBoundingClientRect();
      const next = { left: bounds.left + bounds.width / 2, top: bounds.bottom + 12 };
      setPosition((previous) => previous?.left === next.left && previous.top === next.top ? previous : next);
    };
    const observer = new ResizeObserver(update);
    observer.observe(element);
    if (element.parentElement) observer.observe(element.parentElement);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    update();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [anchor]);

  return position && createPortal(
    <div style={position} className="fixed z-40 max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-md bg-white/90 backdrop-blur-sm dark:bg-neutral-900/90">
      {children}
    </div>,
    document.body,
  );
}
