import { useLayoutEffect, useMemo, useRef } from "react";
import { useState } from "react";
import { useLocation, useSearchParams } from "react-router";
import Fuse from "fuse.js";
import { ArrowDownUp, ArrowUpDown, Check, Ruler, Search, TrendingUp } from "lucide-react";
import { useEffect } from "react";
import { ComparisonControl } from "@/components/comparison-control";
import { parseCompareReference } from "@/lib/platforms";
import { IconCard } from "@/components/icon-card";
import { VectorShapeControl } from "@/components/vector-shape-control";
import { WarningBanner } from "@/components/warning-banner";
import { PageCard } from "@/components/page-card";
import { facetCards, lensesEnabled, type Card, type GridFacet } from "@/lib/platforms";
import { gridOrderOf } from "@/lib/grid-order";

/** Alphabetical compare that ignores punctuation, so "’sodes" sorts
 *  under S instead of leading the list on its apostrophe. */
const byTitle = (a: string, b: string) =>
  a.localeCompare(b, undefined, { ignorePunctuation: true });

function useUrlState(key: string, initial: string) {
  const [params, setParams] = useSearchParams();
  const value = params.get(key) ?? initial;
  const set = (v: string) => {
    const next = new URLSearchParams(window.location.search);
    if (v && v !== initial) next.set(key, v);
    else next.delete(key);
    setParams(next, { replace: true, preventScrollReset: true });
  };
  return [value, set] as const;
}

/**
 * Scroll memory for the grid, keyed by history entry (location.key). The
 * grid unmounts when a card opens its detail takeover, and the scroller
 * is the PageCard viewport — not the window — so the router's own scroll
 * restoration can't cover it. Positions are recorded as the user scrolls
 * and restored in a layout effect on mount: that effect runs inside the
 * router's view-transition commit, so a back navigation captures the
 * grid already scrolled to place and the return morph lands on the
 * correct visible cell.
 */
const scrollMemory = new Map<string, number>();

function useScrollMemory(anchorRef: React.RefObject<HTMLElement | null>) {
  const { key } = useLocation();
  useLayoutEffect(() => {
    const viewport = anchorRef.current?.closest(".overflow-y-auto");
    if (!(viewport instanceof HTMLElement)) return;
    const saved = scrollMemory.get(key);
    if (saved !== undefined) viewport.scrollTop = saved;
    const onScroll = () => scrollMemory.set(key, viewport.scrollTop);
    viewport.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      viewport.removeEventListener("scroll", onScroll);
      scrollMemory.set(key, viewport.scrollTop);
    };
  }, [key, anchorRef]);
}

/** Sort orders: Latest (production default, stays out of the URL), A-Z, Popular —
 *  and, dev-only like the QA lenses, Drift: highest facet drift first
 *  (central RMSE for the facet's comparison pair, from the committed
 *  apps/web/lib/facet-drift.json snapshot), the
 *  re-sourcing worklist in ranked form. ?sort=drift is refused on a
 *  production build the same way the lenses are absent from it. */
const ALL_SORTS = ["latest", "alphabetical", "popular", "drift", "artwork"] as const;
type Sort = (typeof ALL_SORTS)[number];
const SORTS: readonly Sort[] = lensesEnabled
  ? ALL_SORTS
  : ALL_SORTS.filter((s) => s !== "drift" && s !== "artwork");

/** Dev builds open on the Drift sort (the worklist), production on Latest;
 *  the default stays out of the URL either way. */
const DEFAULT_SORT: Sort = lensesEnabled ? "drift" : "latest";

const parseSort = (raw: string): Sort =>
  raw === "alphabetical" || raw === "popular" || raw === "latest" || ((raw === "drift" || raw === "artwork") && lensesEnabled)
    ? raw
    : DEFAULT_SORT;

const SORT_META: Record<Sort, { label: string; Icon: typeof ArrowUpDown }> = {
  latest: { label: "Latest", Icon: ArrowUpDown },
  alphabetical: { label: "A-Z", Icon: ArrowDownUp },
  popular: { label: "Popular", Icon: TrendingUp },
  drift: { label: "Visual difference", Icon: Ruler },
  artwork: { label: "Artwork difference", Icon: Ruler },
};

/** Sorting and the card readout share the same metric and fallback. */
function cardScore(card: Card, sort: Sort, facet: GridFacet, reference: string) {
  if (!lensesEnabled || (sort !== "drift" && sort !== "artwork")) return null;
  const useGlassStore = (facet === "glass" && sort === "drift")
    || (facet === "compare" && reference === "glass-store");
  const [value, label] = useGlassStore
    ? [card.driftGlassStore, "Liquid Glass vs App Store"] as const
    : facet === "compare" && reference === "store"
      ? [card.driftStore, "Vector vs store artwork"] as const
      : sort === "artwork" && card.driftMaterialOff !== null
        ? [card.driftMaterialOff, "Vector vs Liquid Glass with materials off"] as const
        : [card.drift, "Vector vs Liquid Glass"] as const;
  return value === null ? null : { value, label };
}

/** Shows the CURRENT sort; tapping reveals the options with the current
 *  one checked. */
function SortMenu({ sort, onChange, artwork }: { sort: Sort; onChange: (s: Sort) => void; artwork: boolean }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { label, Icon } = SORT_META[sort];

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex cursor-pointer items-center space-x-1.5 rounded-md px-2 py-1.5 text-sm text-neutral-600 hover:bg-neutral-200 hover:text-black dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-white"
      >
        <Icon size={16} strokeWidth={1.8} />
        <span>{label}</span>
      </button>
      {open && (
        <div
          role="listbox"
          aria-label="Sort order"
          className="absolute right-0 top-full z-50 mt-1 w-56 rounded-md border border-neutral-200 bg-white p-1 shadow-md dark:border-neutral-800 dark:bg-neutral-900"
        >
          {SORTS.filter((s) => artwork || s !== "artwork").map((s) => {
            const { label: l, Icon: I } = SORT_META[s];
            return (
              <button
                key={s}
                type="button"
                role="option"
                aria-selected={s === sort}
                onClick={() => {
                  onChange(s);
                  setOpen(false);
                }}
                className="flex w-full cursor-pointer items-center justify-between rounded px-2 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
              >
                <span className="flex items-center space-x-1.5">
                  <I size={15} strokeWidth={1.8} />
                  <span>{l}</span>
                </span>
                {s === sort && <Check size={15} strokeWidth={2} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function Directory({
  cards,
  heading,
  facet = "glass",
}: {
  cards: Card[];
  heading: string;
  /** Which facet view to render — routed via the sidebar, not a toolbar control. */
  facet?: GridFacet;
}) {
  const [query, setQuery] = useUrlState("search", "");
  const location = useLocation();
  const [sortRaw] = useUrlState("sort", DEFAULT_SORT);
  // The comparison pair travels with grid links and detail navigation.
  const [refRaw, setRef] = useUrlState("ref", "glass");
  const [params, setParams] = useSearchParams();
  const parsedSort = parseSort(sortRaw);
  // Preserve old shared links; new selections use a single sort parameter.
  const sort = facet === "glass" && parsedSort === "drift" && params.get("material") === "off"
    ? "artwork" : parsedSort === "artwork" && facet !== "glass" ? "drift" : parsedSort;
  const changeSort = (value: Sort) => {
    const next = new URLSearchParams(params);
    next.delete("material");
    if (value === DEFAULT_SORT) next.delete("sort"); else next.set("sort", value);
    setParams(next, { replace: true, preventScrollReset: true });
  };
  const inputRef = useRef<HTMLInputElement>(null);
  // Anchor inside the PageCard viewport, for scroll save/restore.
  const toolbarRef = useRef<HTMLDivElement>(null);
  useScrollMemory(toolbarRef);

  const base = useMemo(() => facetCards(cards, facet).filter((card) =>
    facet !== "compare" || refRaw !== "glass-store" || card.driftGlassStore !== null
  ), [cards, facet, refRaw]);

  const fuse = useMemo(
    () =>
      new Fuse(base, {
        keys: ["title", "platform.name", "platform.id"],
        threshold: 0.35,
        ignoreLocation: true,
      }),
    [base]
  );

  const shown = useMemo(() => {
    const list = query ? fuse.search(query).map((r) => r.item) : [...base];
    if (query) return list; // search results stay relevance-ordered
    if (sort === "alphabetical")
      list.sort((a, b) => byTitle(a.title, b.title));
    else if (sort === "popular")
      // "popular": snapshot rank (curated pins for OP3-unmeasurable
      // platforms like YouTube, then OP3 share order); unranked sink
      // to the bottom; ties A-Z.
      list.sort(
        (a, b) =>
          (a.popularityRank ?? Infinity) - (b.popularityRank ?? Infinity) ||
          byTitle(a.title, b.title)
      );
    else if (sort === "drift" || sort === "artwork") {
      const figure = (c: Card) => cardScore(c, sort, facet, refRaw)?.value;
      list.sort(
        (a, b) => (figure(b) ?? -1) - (figure(a) ?? -1) || byTitle(a.title, b.title)
      );
    }
    else
      // "latest": newest first-addition date first (meta.json "added",
      // mined from git history); undated sink to the bottom; ties A-Z.
      list.sort(
        (a, b) =>
          (b.added ?? "").localeCompare(a.added ?? "") ||
          byTitle(a.title, b.title)
      );
    return list;
  }, [base, fuse, query, sort, facet, refRaw]);

  const noun = facet === "badge" ? "badges" : "icons";

  // The detail's ← / → walk this exact order (see lib/grid-order.ts).
  const gridOrder = useMemo(
    () => gridOrderOf(shown, location.pathname + location.search),
    [shown, location.pathname, location.search]
  );

  return (
    <>
      <div className="relative mb-2">
        <Search
          size={18}
          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400"
        />
        <input
          ref={inputRef}
          type="search"
          placeholder={`Search ${base.length} ${noun}...`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && setQuery("")}
          className="shadow-xs w-full rounded-md border border-neutral-200 bg-white py-1.5 pl-10 pr-3 text-lg focus:border-neutral-400 focus:outline-none dark:border-neutral-800 dark:bg-neutral-900"
        />
      </div>
      <PageCard withSearch>
        <div
          ref={toolbarRef}
          className={`sticky top-0 z-40 grid min-h-12 items-center border-b border-neutral-200 bg-white/80 px-4 py-1.5 backdrop-blur-sm dark:border-neutral-800 dark:bg-neutral-900/40 ${facet === "flat" || facet === "glass" || facet === "compare" ? "grid-cols-[1fr_auto] gap-y-2 sm:grid-cols-[1fr_auto_1fr]" : "grid-cols-[1fr_auto_1fr]"}`}
        >
          <p className="font-mono text-sm text-neutral-600 dark:text-neutral-400">
            {`${shown.length} ${shown.length === 1 ? "result" : "results"}`}
          </p>
          {/* Facet-specific controls stay centered above the grid. */}
          <div className={`flex items-center justify-center gap-2 ${facet === "flat" || facet === "glass" || facet === "compare" ? "order-3 col-span-2 sm:order-none sm:col-span-1" : ""}`}>
            {(facet === "flat" || facet === "glass") && <VectorShapeControl facet={facet} />}
            {facet === "compare" && (
              <ComparisonControl value={parseCompareReference(refRaw)} onChange={setRef} />
            )}
          </div>
          <div className="flex items-center justify-end">
            <SortMenu sort={sort} onChange={changeSort} artwork={facet === "glass"} />
          </div>
        </div>
        <WarningBanner />
        <div className="container mx-auto my-6 px-6 lg:px-4">
          {shown.length === 0 ? (
            <div className="flex flex-col items-center justify-center space-y-2 py-24 text-center">
              <p className="text-lg font-medium">Icon not found</p>
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                “{query}” didn’t match any {noun}.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {shown.map((card) => (
                <IconCard key={card.key} card={card} facet={facet} gridOrder={gridOrder}
                  score={query ? null : cardScore(card, sort, facet, refRaw)} />
              ))}
            </div>
          )}
        </div>
      </PageCard>
    </>
  );
}
