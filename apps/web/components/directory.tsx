import { useMemo, useRef } from "react";
import { useState } from "react";
import { useSearchParams } from "react-router";
import Fuse from "fuse.js";
import { ArrowDownUp, ArrowUpDown, Search } from "lucide-react";
import { IconCard } from "@/components/icon-card";
import { PageCard } from "@/components/page-card";
import { facetCards, parseFacet, type Card, type Facet } from "@/lib/platforms";
import { cn } from "@/lib/cn";

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

export function Directory({
  cards,
  heading,
  facetSwitcher = true,
}: {
  cards: Card[];
  heading: string;
  /** Hidden on the glass-only page (/liquid-glass). */
  facetSwitcher?: boolean;
}) {
  const [query, setQuery] = useUrlState("search", "");
  const [sort, setSort] = useUrlState("sort", "latest");
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
    if (!query && sort === "alphabetical")
      list.sort((a, b) => a.title.localeCompare(b.title));
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
            <button
              type="button"
              onClick={() =>
                setSort(sort === "alphabetical" ? "latest" : "alphabetical")
              }
              className="flex cursor-pointer items-center space-x-1.5 rounded-md px-2 py-1.5 text-sm text-neutral-600 hover:bg-neutral-200 hover:text-black dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-white"
            >
              {sort === "alphabetical" ? (
                <ArrowDownUp size={16} strokeWidth={1.8} />
              ) : (
                <ArrowUpDown size={16} strokeWidth={1.8} />
              )}
              <span>
                {sort === "alphabetical" ? "Sort by latest" : "Sort A-Z"}
              </span>
            </button>
          </div>
        </div>
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
