import { visibleCards, type Card } from "@/lib/platforms";

/**
 * The grid a detail page was opened from, carried in router history state
 * so ← / → on the detail step through THAT grid's order — whatever facet,
 * sort, search, lens or reference switch produced it — rather than some
 * global order. `ids` are platform ids in grid order (a multi-variant
 * platform appears once); `from` is the grid's URL, for the record.
 */
export interface GridOrder {
  ids: string[];
  from: string;
}

export function gridOrderOf(shown: Card[], from: string): GridOrder {
  const ids: string[] = [];
  for (const c of shown) if (!ids.includes(c.platform.id)) ids.push(c.platform.id);
  return { ids, from };
}

/** The order carried in `location.state`, if a grid put one there. */
export function readGridOrder(state: unknown): GridOrder | null {
  const g = (state as { grid?: unknown } | null)?.grid;
  if (!g || typeof g !== "object") return null;
  const { ids, from } = g as Partial<GridOrder>;
  if (!Array.isArray(ids) || !ids.every((v) => typeof v === "string")) return null;
  return { ids, from: typeof from === "string" ? from : "/" };
}

/**
 * A detail opened directly (shared link, reload) has no grid behind it:
 * the arrows then walk the home grid's default order — Latest, as the
 * Directory sorts it (newest `added` first, ties A-Z; keep in step with
 * components/directory.tsx).
 */
export function defaultGridOrder(): GridOrder {
  const byTitle = (a: string, b: string) => a.localeCompare(b, undefined, { ignorePunctuation: true });
  const list = [...visibleCards].sort(
    (a, b) => (b.added ?? "").localeCompare(a.added ?? "") || byTitle(a.title, b.title)
  );
  return gridOrderOf(list, "/");
}
