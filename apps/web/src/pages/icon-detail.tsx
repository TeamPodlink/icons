import { useEffect, useRef, useState } from "react";
import {
  Navigate,
  useLocation,
  useParams,
  useSearchParams,
} from "react-router";
import {
  ArrowLeft,
  ChevronDown,
  Copy,
  Download,
  PenTool,
  Ticket,
  X,
} from "lucide-react";
import {
  ContextMenu,
  type ContextMenuItem,
} from "@/components/context-menu";
import {
  BadgeTile,
  FlatArtwork,
  GlassArtwork,
  IconDetail,
} from "@/components/icon-detail";
import { MaterialsIcon } from "@/components/materials-icon";
import { PageCard } from "@/components/page-card";
import { copyItemsFor, downloadItemsFor } from "@/lib/asset-menus";
import { resolvePlatform, type Facet, type Platform } from "@/lib/platforms";
import { useTheme } from "@/lib/theme";
import { useTitle } from "@/lib/use-title";
import {
  cardTransitionStyle,
  useTransitionNavigate,
} from "@/lib/view-transition";
import { cn } from "@/lib/cn";
import { NotFound } from "@/src/pages/not-found";

/** The grid-card key this platform's detail pairs with: its first
 *  bundle's slug, or the platform id for glass-less platforms — exactly
 *  how lib/platforms.ts keys the card. */
function panelKey(platform: Platform): string {
  return platform.bundles[0]?.slug ?? platform.id;
}

/** ?facet= on /icon/:id, matching the site's param conventions: "vector"
 *  or "badge" select an alternate hero; absent/unknown means glass
 *  ("flat" accepted as the legacy spelling of vector). */
function parseDetailFacet(raw: string | null): Facet {
  if (raw === "vector" || raw === "flat") return "flat";
  if (raw === "badge") return "badge";
  return "glass";
}

/** Toolbar dropdown: a labeled button (Copy / Download + chevron) whose
 *  menu opens anchored to the button's bottom-right edge, reusing the
 *  ContextMenu in its anchored (alignRight) mode. */
function ToolbarMenu({
  label,
  icon: Icon,
  items,
}: {
  label: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  items: ContextMenuItem[];
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  // The menu's click-away pointerdown fires before this button's click:
  // remember whether the menu was open at press time so a second click
  // toggles closed instead of instantly reopening.
  const wasOpenRef = useRef(false);
  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={menu !== null}
        onPointerDown={() => {
          wasOpenRef.current = menu !== null;
        }}
        onClick={() => {
          if (wasOpenRef.current) {
            wasOpenRef.current = false;
            return;
          }
          const r = btnRef.current!.getBoundingClientRect();
          setMenu({ x: r.right, y: r.bottom + 4 });
        }}
        className="flex cursor-pointer items-center space-x-1.5 rounded-md px-2 py-1.5 text-sm text-neutral-600 hover:bg-neutral-200 hover:text-black dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-white"
      >
        <Icon size={16} strokeWidth={1.8} />
        <span>{label}</span>
        <ChevronDown size={14} strokeWidth={1.8} />
      </button>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          alignRight
          items={items}
          label={`${label} options`}
          onClose={() => setMenu(null)}
        />
      )}
    </>
  );
}

const closeBtn =
  "flex h-9 w-9 cursor-pointer items-center justify-center rounded-md text-neutral-600 outline-none hover:bg-neutral-200 hover:text-black focus-visible:ring-2 focus-visible:ring-neutral-400 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-white dark:focus-visible:ring-neutral-600";

/**
 * Direct-load presentation of /icon/:id: the grid's PageCard chrome with
 * the sticky toolbar persisting into the detail state (svgl-style). The
 * toolbar hosts the back affordance (← platform name) on the left and a
 * segmented control of the platform's available variants on the right;
 * the body is the selected variant's hero. Variant selection is ?facet=
 * URL state, so variant views are shareable. Alias ids canonicalize with
 * a replace-navigation (keeping the query); unknown ids get the site 404.
 * The modal presentation below is untouched — minimal card, no toolbar.
 */
export function IconDetailPage() {
  const { id = "" } = useParams();
  const location = useLocation();
  const navigate = useTransitionNavigate();
  const [params, setParams] = useSearchParams();
  // Menu actions resolve to the rendition on screen (theme-scoped).
  const darkTheme = useTheme().resolvedTheme === "dark";
  const platform = resolvePlatform(id);
  useTitle(platform ? `${platform.name} · refraction` : "Not found · refraction");
  if (!platform) return <NotFound />;
  if (platform.id !== id)
    return (
      <Navigate
        to={{ pathname: `/icon/${platform.id}`, search: location.search }}
        replace
      />
    );

  const p = platform;
  // Only the variants this platform actually ships become segments.
  const segments: {
    facet: Facet;
    label: string;
    icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  }[] = [
    ...(p.bundles.length > 0
      ? [{ facet: "glass" as const, label: "Liquid Glass", icon: MaterialsIcon }]
      : []),
    ...(p.hasFlat
      ? [{ facet: "flat" as const, label: "Vector", icon: PenTool }]
      : []),
    ...(p.hasBadge
      ? [{ facet: "badge" as const, label: "Badge", icon: Ticket }]
      : []),
  ];
  const requested = parseDetailFacet(params.get("facet"));
  // A ?facet the platform doesn't ship falls back to its first variant.
  const facet = segments.some((s) => s.facet === requested)
    ? requested
    : segments[0]?.facet ?? "glass";

  const setFacet = (f: Facet) => {
    const next = new URLSearchParams(params);
    if (f === "glass") next.delete("facet");
    else next.set("facet", f === "flat" ? "vector" : "badge");
    setParams(next, { replace: true, preventScrollReset: true });
  };

  // The back affordance: pop when there's in-app history to return to
  // (replaying any recorded morph); on a direct load go to the directory
  // instead. The router's history index is the truthful signal — a
  // segment switch replaces (new location.key, same entry), so idx stays
  // 0 on a direct-loaded page.
  const back = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate("/");
  };

  const copyItems = copyItemsFor(facet, p, p.bundles[0] ?? null, darkTheme);
  const downloadItems = downloadItemsFor(
    facet,
    p,
    p.bundles[0] ?? null,
    darkTheme
  );

  return (
    <PageCard>
      <div className="sticky top-0 z-40 grid h-12 grid-cols-[1fr_auto_1fr] items-center border-b border-neutral-200 bg-white/80 px-4 py-1.5 backdrop-blur-sm dark:border-neutral-800 dark:bg-neutral-900/40">
        {/* Back is the arrow alone; the name beside it is the page H1. */}
        <div className="flex min-w-0 items-center space-x-1.5">
          <button
            type="button"
            onClick={back}
            aria-label="Back to the directory"
            title="Back to the directory"
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-neutral-600 hover:bg-neutral-200 hover:text-black dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-white"
          >
            <ArrowLeft size={16} strokeWidth={1.8} />
          </button>
          <h1 className="truncate text-sm font-medium">{p.name}</h1>
        </div>
        {segments.length > 0 ? (
          <div
            role="group"
            aria-label="Variant"
            className="flex items-center rounded-md border border-neutral-200 p-0.5 dark:border-neutral-800"
          >
            {segments.map(({ facet: f, label, icon: Icon }) => (
              <button
                key={f}
                type="button"
                aria-pressed={facet === f}
                aria-label={label}
                title={label}
                onClick={() => setFacet(f)}
                className={cn(
                  "flex cursor-pointer items-center rounded px-2.5 py-1",
                  facet === f
                    ? "bg-neutral-200 font-medium text-black dark:bg-neutral-800 dark:text-white"
                    : "text-neutral-500 hover:text-black dark:text-neutral-400 dark:hover:text-white"
                )}
              >
                <Icon size={14} strokeWidth={1.8} />
              </button>
            ))}
          </div>
        ) : (
          <div />
        )}
        <div className="flex items-center justify-end space-x-0.5">
          {copyItems.length > 0 && (
            <ToolbarMenu label="Copy" icon={Copy} items={copyItems} />
          )}
          {downloadItems.length > 0 && (
            <ToolbarMenu label="Download" icon={Download} items={downloadItems} />
          )}
        </div>
      </div>

      {/* The selected variant's hero. The glass hero (and the flat hero
          standing in for glass-less platforms) carries the container-pair
          name so the grid cell ↔ detail morph stays wired; other
          variants render unnamed. */}
      <div className="flex min-h-[calc(100vh-12rem)] flex-col items-center justify-center px-6 py-16">
        {facet === "glass" && p.bundles[0] ? (
          <div style={cardTransitionStyle(panelKey(p))}>
            <GlassArtwork bundle={p.bundles[0]} />
          </div>
        ) : facet === "flat" && p.hasFlat ? (
          p.bundles.length === 0 ? (
            <div style={cardTransitionStyle(p.id)}>
              <FlatArtwork platform={p} named />
            </div>
          ) : (
            <FlatArtwork platform={p} named={false} />
          )
        ) : facet === "badge" && p.hasBadge ? (
          <div className="grid w-full max-w-xl grid-cols-1 gap-3 sm:grid-cols-2">
            <BadgeTile platform={p} dark={false} />
            <BadgeTile platform={p} dark={true} />
          </div>
        ) : null}
      </div>
    </PageCard>
  );
}

/**
 * Modal presentation of /icon/:id, rendered over the grid when the
 * navigation carried a background location (card click). Closing is
 * navigate(-1) — backdrop click, the X, or Escape — which returns to the
 * background entry, so the grid's search/sort/scroll survive untouched.
 */
export function IconDetailModal() {
  const { id = "" } = useParams();
  const location = useLocation();
  // Closing pops through the data router so the recorded open transition
  // replays in reverse (preview morphs back into its grid card).
  const navigate = useTransitionNavigate();
  const platform = resolvePlatform(id);
  useTitle(
    platform ? `${platform.name} · refraction` : "Not found · refraction",
    true
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") navigate(-1);
    };
    document.addEventListener("keydown", onKey);
    // Belt-and-braces scroll lock (the grid scrolls inside PageCard, but
    // lock the body too so nothing behind the overlay can move).
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [navigate]);

  // Alias deep link opened as a modal: canonicalize, keeping the
  // background state so the modal presentation survives the replace.
  if (platform && platform.id !== id)
    return (
      <Navigate to={`/icon/${platform.id}`} replace state={location.state} />
    );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={platform ? `${platform.name} icon details` : "Icon details"}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
    >
      <div
        aria-hidden="true"
        onClick={() => navigate(-1)}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
      />
      {/* The panel is the cell's morph target: it carries `card-<key>`
          while the grid cell gets the same name just-in-time, so the
          cell visibly expands into this dialog (and back on close). */}
      <div
        style={platform ? cardTransitionStyle(panelKey(platform)) : undefined}
        className="relative flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-xl dark:border-neutral-800 dark:bg-neutral-900"
      >
        <button
          type="button"
          aria-label="Close"
          title="Close"
          autoFocus
          onClick={() => navigate(-1)}
          className={`absolute right-3 top-3 z-10 ${closeBtn}`}
        >
          <X size={18} strokeWidth={1.8} />
        </button>
        <div className="overflow-y-auto">
          {platform ? (
            <IconDetail platform={platform} />
          ) : (
            <div className="flex flex-col items-center justify-center space-y-2 px-6 py-20 text-center">
              <p className="font-mono text-sm text-neutral-500 dark:text-neutral-400">
                404
              </p>
              <p className="text-lg font-medium">Icon not found</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
