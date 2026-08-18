import raw from "./platforms.gen.json";

export interface GlassBundle {
  slug: string;
  title: string;
  variant: string | null;
  recipe: boolean;
  rmse: number | null;
  hasDark: boolean;
  /**
   * For hasDark:false bundles (identical light/dark renditions), the
   * measured classification from pipeline/audit-dark-status.mjs:
   * "native" — the artwork is already dark, identical renditions are
   * correct and final; "missing" — light artwork whose Apple-darkened
   * rendition doesn't exist yet. null when hasDark is true (a real
   * dark rendition exists) or the bundle hasn't been audited.
   */
  darkStatus: "native" | "missing" | null;
  /** Provenance rung: decanted | appstore-artwork | flat-svg | flat-svg-split | flat-svg-browser | null (pre-monorepo, unlabeled). */
  source: string | null;
}

export interface Platform {
  id: string;
  name: string;
  active: boolean;
  url: string | null;
  guidelinesUrl: string | null;
  hasFlat: boolean;
  hasBadge: boolean;
  bundles: GlassBundle[];
}

export const platforms: Platform[] = raw as Platform[];

const SOURCE_LABEL: Record<string, string> = {
  decanted: "decanted",
  "catalog-artwork": "catalog artwork",
  "appstore-artwork": "app store artwork",
  "appstore-artwork-split": "artwork split",
  "catalog-artwork-split": "artwork split",
  "flat-svg": "svg layer",
  "flat-svg-split": "svg split",
  "flat-svg-browser": "browser raster",
  "flat-svg-raster": "browser raster",
};

/**
 * Debug categories: computed QA lenses over the collection, replacing
 * editorial taxonomy. Each is a worklist — "no recipe" is the recipe
 * backlog, "missing dark" the icons whose Apple-darkened rendition we
 * don't have yet (the dark-variant backlog), "dark as-is" the icons
 * whose artwork is already dark so identical light/dark is correct
 * (measured split: pipeline/audit-dark-status.mjs), "unlabeled source"
 * the provenance backfill, and the source rungs show how far up the
 * upgrade ladder each icon sits.
 */
export function debugCategories(p: Platform, b: GlassBundle | null): string[] {
  const cats: string[] = [];
  if (b) {
    if (!b.recipe) cats.push("no recipe");
    if (!b.hasDark)
      cats.push(b.darkStatus === "native" ? "dark as-is" : "missing dark");
    cats.push(b.source ? SOURCE_LABEL[b.source] ?? b.source : "unlabeled source");
  }
  if (!p.active) cats.push("inactive");
  return cats;
}

/**
 * A directory card: one per liquid glass bundle, plus one per platform
 * that has no glass yet (flat-icon fallback).
 */
export interface Card {
  key: string;
  title: string;
  platform: Platform;
  facet: "glass" | "flat";
  bundle: GlassBundle | null;
  categories: string[];
}

export const cards: Card[] = platforms.flatMap((p): Card[] => {
  if (p.bundles.length > 0)
    return p.bundles.map((b) => ({
      key: b.slug,
      title: b.title,
      platform: p,
      facet: "glass",
      bundle: b,
      categories: debugCategories(p, b),
    }));
  if (p.hasFlat)
    return [
      {
        key: p.id,
        title: p.name,
        platform: p,
        facet: "flat",
        bundle: null,
        categories: debugCategories(p, null),
      },
    ];
  return [];
});

/**
 * Cards shown in the main directory and non-inactive lenses: inactive
 * platforms are hidden from the site and reachable only through the
 * "inactive" QA lens.
 */
export const visibleCards = cards.filter((c) => c.platform.active);

export const glassCards = visibleCards.filter((c) => c.facet === "glass");

/**
 * Where liquid glass raster assets are served from. Production builds set
 * VITE_ASSET_BASE to the immutable R2 release prefix
 * (https://assets.icons.podlink.com/<version>); locally the pipeline syncs
 * rendered assets into public/library.
 */
export const ASSET_BASE = import.meta.env.VITE_ASSET_BASE ?? "/library";

export function getCategories(): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const c of cards)
    for (const cat of c.categories) {
      if (!c.platform.active && cat !== "inactive") continue;
      counts.set(cat, (counts.get(cat) ?? 0) + 1);
    }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function categorySlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function getCardsByCategory(slug: string): Card[] {
  return cards.filter(
    (c) =>
      c.categories.some((cat) => categorySlug(cat) === slug) &&
      (slug === "inactive" || c.platform.active)
  );
}

export function categoryNameFromSlug(slug: string): string | undefined {
  return getCategories().find((c) => categorySlug(c.name) === slug)?.name;
}

/** Liquid glass raster path for a bundle slug (AVIF-primary asset set). */
export function assetPath(
  slug: string,
  opts: {
    size?: 32 | 64 | 128 | 256 | 512;
    dark?: boolean;
    format?: "avif" | "webp";
  } = {}
): string {
  const d = opts.dark ? "-dark" : "";
  return opts.size
    ? `${ASSET_BASE}/${slug}${d}-${opts.size}.${opts.format ?? "avif"}`
    : `${ASSET_BASE}/${slug}${d}.png`;
}

/** Flat squircle SVG path for a platform id. */
export function flatPath(id: string): string {
  return `/flat/${id}.svg`;
}

export function shadcnCommand(slug: string): string {
  return `npx shadcn@latest add @refraction/${slug}`;
}
