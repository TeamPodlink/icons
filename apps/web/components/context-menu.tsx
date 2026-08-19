import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { LucideIcon } from "lucide-react";

export interface ContextMenuItem {
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
}

/**
 * Custom right-click menu (grid cards): rendered in a portal at the
 * cursor, clamped to the viewport, closed by click-away / Escape /
 * scroll / resize. Icon + label rows, `role="menu"` with arrow-key
 * focus movement.
 */
export function ContextMenu({
  x,
  y,
  items,
  label,
  onClose,
}: {
  x: number;
  y: number;
  items: ContextMenuItem[];
  /** Accessible name for the menu, e.g. "Overcast actions". */
  label: string;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  // Position after first paint, once the menu's size is measurable.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
      left: Math.max(8, Math.min(x, window.innerWidth - r.width - 8)),
      top: Math.max(8, Math.min(y, window.innerHeight - r.height - 8)),
    });
  }, [x, y]);

  // Focus the first row once the menu is visible (focus() is a no-op
  // while it's still visibility-hidden awaiting measurement).
  const positioned = pos !== null;
  useEffect(() => {
    if (positioned) ref.current?.querySelector("button")?.focus();
  }, [positioned]);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      const buttons = [...(ref.current?.querySelectorAll("button") ?? [])];
      if (buttons.length === 0) return;
      const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next =
        e.key === "ArrowDown"
          ? buttons[(i + 1) % buttons.length]
          : buttons[(i - 1 + buttons.length) % buttons.length];
      next.focus();
    };
    const close = () => onClose();
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("blur", close);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("blur", close);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      onContextMenu={(e) => e.preventDefault()}
      style={
        pos ?? { left: x, top: y, visibility: "hidden" as const }
      }
      className="fixed z-[60] min-w-48 rounded-md border border-neutral-200 bg-white p-1 shadow-md dark:border-neutral-800 dark:bg-neutral-900"
    >
      {items.map(({ label: itemLabel, icon: Icon, onSelect }) => (
        <button
          key={itemLabel}
          type="button"
          role="menuitem"
          onClick={() => {
            onClose();
            onSelect();
          }}
          className="flex w-full cursor-pointer items-center space-x-2 rounded px-2 py-1.5 text-sm text-neutral-700 outline-none hover:bg-neutral-100 focus-visible:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:focus-visible:bg-neutral-800"
        >
          <Icon size={15} strokeWidth={1.8} className="shrink-0" />
          <span>{itemLabel}</span>
        </button>
      ))}
    </div>,
    document.body
  );
}
