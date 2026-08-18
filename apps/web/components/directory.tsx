import { useMemo, useRef } from "react";
import { useState } from "react";
import { useSearchParams } from "react-router";
import Fuse from "fuse.js";
import { ArrowDownUp, ArrowUpDown, Check, Search, TrendingUp } from "lucide-react";
import { useEffect } from "react";
import { IconCard } from "@/components/icon-card";
import { WarningBanner } from "@/components/warning-banner";
import { PageCard } from "@/components/page-card";
import { facetCards, parseFacet, type Card, type Facet } from "@/lib/platforms";
import { cn } from "@/lib/cn";

/** Alphabetical compare that ignores punctuation, so "’sodes" sorts
 *  under S instead of leading the list on its apostrophe. */
const byTitle = (a: string, b: string) =>
  a.localeCompare(b, undefined, { ignorePunctuation: true });

function useUrlState(key: string, initial: string) {
  const [params, setParams] = useSearchParams();
  const [value, setValue] = useState(params.get(key) ?? initial);
  const set = (v: string) => {
    setValue(v);
    const next = new URLSearchParams(window.location.search);
    if (v && v !== initial) next.set(key, v);
    else next.delete(key);
    setParams(next, { replace: true, preventScrollReset: true });
  };
  return [value, set] as const;
}

const FACETS: Facet[] = ["glass", "flat", "badge"];

/** Sort cycle: Latest → A-Z → Popular → Latest. "latest" is the
 *  default and stays out of the URL (?sort=alphabetical / ?sort=popular). */
const SORTS = ["latest", "alphabetical", "popular"] as const;
type Sort = (typeof SORTS)[number];

const parseSort = (raw: string): Sort =>
  raw === "alphabetical" || raw === "popular" ? raw : "latest";

const SORT_META: Record<Sort, { label: string; Icon: typeof ArrowUpDown }> = {
  latest: { label: "Latest", Icon: ArrowUpDown },
  alphabetical: { label: "A-Z", Icon: ArrowDownUp },
  popular: { label: "Popular", Icon: TrendingUp },
};

/** Shows the CURRENT sort; tapping reveals the options with the current
 *  one checked. */
function SortMenu({ sort, onChange }: { sort: Sort; onChange: (s: Sort) => void }) {
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
          className="absolute right-0 top-full z-50 mt-1 w-36 rounded-md border border-neutral-200 bg-white p-1 shadow-md dark:border-neutral-800 dark:bg-neutral-900"
        >
          {SORTS.map((s) => {
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
  facetSwitcher = true,
}: {
  cards: Card[];
  heading: string;
  facetSwitcher?: boolean;
}) {
  const [query, setQuery] = useUrlState("search", "");
  const [sortRaw, setSort] = useUrlState("sort", "latest");
  const sort = parseSort(sortRaw);
  const [facetRaw, setFacet] = useUrlState("facet", "glass");
  const facet = facetSwitcher ? parseFacet(facetRaw) : "glass";
  const inputRef = useRef<HTMLInputElement>(null);

  const base = useMemo(() => facetCards(cards, facet), [cards, facet]);

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
      // "popular": OP3 download share (percent) descending; platforms
      // without OP3 data sink to the bottom; ties A-Z.
      list.sort(
        (a, b) =>
          (b.popularity ?? -1) - (a.popularity ?? -1) ||
          byTitle(a.title, b.title)
      );
    else
      // "latest": newest first-addition date first (meta.json "added",
      // mined from git history); undated sink to the bottom; ties A-Z.
      list.sort(
        (a, b) =>
          (b.added ?? "").localeCompare(a.added ?? "") ||
          byTitle(a.title, b.title)
      );
    return list;
  }, [base, fuse, query, sort]);

  const noun = facet === "badge" ? "badges" : "icons";

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
        <div className="sticky top-0 z-40 flex h-12 items-center justify-between border-b border-neutral-200 bg-white/80 px-4 py-1.5 backdrop-blur-sm dark:border-neutral-800 dark:bg-neutral-900/40">
          <p className="font-mono text-sm text-neutral-600 dark:text-neutral-400">
            {heading === "Home"
              ? `${shown.length} ${noun}`
              : `${heading} — ${shown.length} ${noun}`}
          </p>
          <div className="flex items-center space-x-2">
            {facetSwitcher && (
              <div
                role="group"
                aria-label="Facet"
                className="flex items-center rounded-md border border-neutral-200 p-0.5 dark:border-neutral-800"
              >
                {FACETS.map((f) => (
                  <button
                    key={f}
                    type="button"
                    aria-pressed={facet === f}
                    onClick={() => setFacet(f)}
                    className={cn(
                      "cursor-pointer rounded px-2 py-1 font-mono text-xs capitalize",
                      facet === f
                        ? "bg-neutral-200 font-medium text-black dark:bg-neutral-800 dark:text-white"
                        : "text-neutral-500 hover:text-black dark:text-neutral-400 dark:hover:text-white"
                    )}
                  >
                    {f}
                  </button>
                ))}
              </div>
            )}
            <SortMenu sort={sort} onChange={setSort} />
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
                <IconCard key={card.key} card={card} facet={facet} />
              ))}
            </div>
          )}
        </div>
      </PageCard>
    </>
  );
}
