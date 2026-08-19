import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

export interface ContextMenuItem {
  label: string;
  icon?: React.ComponentType<{
    size?: number;
    strokeWidth?: number;
    className?: string;
  }>;
  /** Leaf action. Ignored when `children` is present. */
  onSelect?: () => void;
  /** Nested submenu: the row grows a chevron and flies out an adjacent
   *  panel (hover / click / ArrowRight; ArrowLeft closes). */
  children?: ContextMenuItem[];
}

const panelCls =
  "z-[60] min-w-44 rounded-md border border-neutral-200 bg-white p-1 shadow-md dark:border-neutral-800 dark:bg-neutral-900";
const rowCls =
  "flex w-full cursor-pointer items-center justify-between rounded px-2 py-1.5 text-sm text-neutral-700 outline-none hover:bg-neutral-100 focus-visible:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:focus-visible:bg-neutral-800";

function RowLabel({ item }: { item: ContextMenuItem }) {
  const Icon = item.icon;
  return (
    <span className="flex items-center space-x-2">
      {Icon && <Icon size={15} strokeWidth={1.8} className="shrink-0" />}
      <span className="whitespace-nowrap">{item.label}</span>
    </span>
  );
}

/** A submenu panel, positioned adjacent to its parent row (flyout right,
 *  flipping left and shifting up as the viewport requires). `autoFocus`
 *  (keyboard-opened) focuses the first row once positioned. ArrowLeft
 *  hands control back to the parent row. */
function SubPanel({
  rowRef,
  items,
  autoFocus,
  onCloseAll,
  onBack,
}: {
  rowRef: React.RefObject<HTMLDivElement | null>;
  items: ContextMenuItem[];
  autoFocus: boolean;
  onCloseAll: () => void;
  onBack: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({
    left: "100%",
    top: -4,
    visibility: "hidden",
  });
  const positioned = style.visibility !== "hidden";

  useLayoutEffect(() => {
    const el = ref.current;
    const row = rowRef.current;
    if (!el || !row) return;
    const r = el.getBoundingClientRect();
    const rowR = row.getBoundingClientRect();
    const next: CSSProperties = {};
    if (rowR.right + r.width > window.innerWidth - 8) next.right = "100%";
    else next.left = "100%";
    let top = -4;
    const overflow = rowR.top + top + r.height - (window.innerHeight - 8);
    if (overflow > 0) top -= overflow;
    next.top = Math.max(top, 8 - rowR.top);
    setStyle(next);
  }, [rowRef]);

  useEffect(() => {
    if (autoFocus && positioned)
      ref.current?.querySelector("button")?.focus();
  }, [autoFocus, positioned]);

  return (
    <div
      ref={ref}
      role="menu"
      style={style}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          e.stopPropagation();
          onBack();
        }
      }}
      className={cn("absolute", panelCls)}
    >
      <MenuRows items={items} onCloseAll={onCloseAll} />
    </div>
  );
}

function MenuRows({
  items,
  onCloseAll,
}: {
  items: ContextMenuItem[];
  onCloseAll: () => void;
}) {
  // Which row's submenu is open, and whether it was opened via keyboard
  // (focus moves into it) or hover (pointer keeps control).
  const [open, setOpen] = useState<{ i: number; focus: boolean } | null>(null);
  return (
    <>
      {items.map((item, i) =>
        item.children ? (
          <ParentRow
            key={item.label}
            item={item}
            open={open?.i === i}
            autoFocusSub={open?.i === i && open.focus}
            onOpen={(focus) => setOpen({ i, focus })}
            onCloseSub={() => setOpen(null)}
            onHover={() => setOpen({ i, focus: false })}
            onCloseAll={onCloseAll}
          />
        ) : (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            onMouseEnter={() => setOpen(null)}
            onClick={() => {
              onCloseAll();
              item.onSelect?.();
            }}
            className={rowCls}
          >
            <RowLabel item={item} />
          </button>
        )
      )}
    </>
  );
}

function ParentRow({
  item,
  open,
  autoFocusSub,
  onOpen,
  onCloseSub,
  onHover,
  onCloseAll,
}: {
  item: ContextMenuItem;
  open: boolean;
  autoFocusSub: boolean;
  onOpen: (focus: boolean) => void;
  onCloseSub: () => void;
  onHover: () => void;
  onCloseAll: () => void;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  return (
    <div ref={rowRef} className="relative" onMouseEnter={onHover}>
      <button
        ref={btnRef}
        type="button"
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => (open ? onCloseSub() : onOpen(false))}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight" && !open) {
            e.preventDefault();
            e.stopPropagation();
            onOpen(true);
          }
        }}
        className={rowCls}
      >
        <RowLabel item={item} />
        <ChevronRight size={14} strokeWidth={1.8} className="ml-3 shrink-0" />
      </button>
      {open && (
        <SubPanel
          rowRef={rowRef}
          items={item.children!}
          autoFocus={autoFocusSub}
          onCloseAll={onCloseAll}
          onBack={() => {
            onCloseSub();
            btnRef.current?.focus();
          }}
        />
      )}
    </div>
  );
}

/**
 * Custom menu (grid card right-click, detail toolbar dropdowns):
 * rendered in a portal, viewport-clamped, closed by click-away / Escape /
 * scroll / resize. Icon + label rows with optional nested flyout
 * submenus; `role="menu"` semantics with full arrow-key navigation
 * (Up/Down cycle the active panel, Right opens a submenu, Left closes
 * it). Position: `x`/`y` is the cursor point, or — for menus anchored to
 * a button — the anchor edge, with `alignRight` treating `x` as the
 * menu's right edge.
 */
export function ContextMenu({
  x,
  y,
  items,
  label,
  onClose,
  alignRight = false,
}: {
  x: number;
  y: number;
  items: ContextMenuItem[];
  /** Accessible name for the menu, e.g. "Overcast actions". */
  label: string;
  onClose: () => void;
  /** Treat `x` as the menu's right edge (anchored dropdowns near the
   *  viewport's right side). */
  alignRight?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  // Position after first paint, once the menu's size is measurable.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const left = alignRight ? x - r.width : x;
    setPos({
      left: Math.max(8, Math.min(left, window.innerWidth - r.width - 8)),
      top: Math.max(8, Math.min(y, window.innerHeight - r.height - 8)),
    });
  }, [x, y, alignRight]);

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
      }
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

  /** Arrow-key navigation, DOM-driven so it works at any nesting depth:
   *  the active panel is the [role="menu"] containing focus; its direct
   *  rows are `:scope > button` (leaves) and `:scope > div > button`
   *  (submenu parents — their subpanels sit deeper and aren't matched). */
  const handleKeys = (e: React.KeyboardEvent) => {
    const active = document.activeElement as HTMLElement | null;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const panel = (active?.closest('[role="menu"]') ??
        ref.current) as HTMLElement | null;
      if (!panel) return;
      const rows = [
        ...panel.querySelectorAll<HTMLButtonElement>(
          ":scope > button, :scope > div > button"
        ),
      ];
      if (rows.length === 0) return;
      const i = rows.indexOf(active as HTMLButtonElement);
      const next =
        e.key === "ArrowDown"
          ? rows[(i + 1) % rows.length]
          : rows[(i - 1 + rows.length) % rows.length];
      next.focus();
    } else if (e.key === "ArrowRight") {
      if (
        active?.getAttribute("aria-haspopup") === "menu" &&
        active.getAttribute("aria-expanded") !== "true"
      ) {
        e.preventDefault();
        active.click();
        // Focus lands on the subpanel's first row once it mounts.
        setTimeout(() => {
          active.parentElement
            ?.querySelector<HTMLButtonElement>('[role="menu"] button')
            ?.focus();
        }, 0);
      }
    } else if (e.key === "ArrowLeft") {
      const panel = active?.closest<HTMLElement>('[role="menu"]');
      if (panel && panel !== ref.current) {
        e.preventDefault();
        const parentRow = panel.parentElement?.querySelector<HTMLButtonElement>(
          ":scope > button"
        );
        parentRow?.click(); // aria-expanded row: click toggles it closed
        parentRow?.focus();
      }
    }
  };

  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={handleKeys}
      style={pos ?? { left: x, top: y, visibility: "hidden" as const }}
      className={cn("fixed", panelCls)}
    >
      <MenuRows items={items} onCloseAll={onClose} />
    </div>,
    document.body
  );
}
