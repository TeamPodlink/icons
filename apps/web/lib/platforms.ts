import raw from "./platforms.gen.json";

export interface GlassBundle {
  slug: string;
  title: string;
  variant: string | null;
  recipe: boolean;
  rmse: number | null;
  hasDark: boolean;
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
 * backlog, "no dark variant" the icons that render a light background
 * everywhere, "unlabeled source" the provenance backfill, and the
 * source rungs show how far up the upgrade ladder each icon sits.
 */
export function debugCategories(p: Platform, b: GlassBundle | null): string[] {
  const cats: string[] = [];
  if (b) {
    if (!b.recipe) cats.push("no recipe");
    if (!b.hasDark) cats.push("no dark variant");
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

export const glassCards = cards.filter((c) => c.facet === "glass");

/** Where liquid glass raster assets are served from. */
export const ASSET_BASE = process.env.NEXT_PUBLIC_ASSET_BASE ?? "/library";

export function getCategories(): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const c of cards)
    for (const cat of c.categories) counts.set(cat, (counts.get(cat) ?? 0) + 1);
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
  return cards.filter((c) =>
    c.categories.some((cat) => categorySlug(cat) === slug)
  );
}

export function categoryNameFromSlug(slug: string): string | undefined {
  return getCategories().find((c) => categorySlug(c.name) === slug)?.name;
}

/** Liquid glass raster path for a bundle slug. */
export function assetPath(
  slug: string,
  opts: { size?: 64 | 128 | 256; dark?: boolean } = {}
): string {
  const d = opts.dark ? "-dark" : "";
  return opts.size
    ? `${ASSET_BASE}/${slug}${d}-${opts.size}.webp`
    : `${ASSET_BASE}/${slug}${d}.png`;
}

/** Flat squircle SVG path for a platform id. */
export function flatPath(id: string): string {
  return `/flat/${id}.svg`;
}

export function shadcnCommand(slug: string): string {
  return `npx shadcn@latest add @refraction/${slug}`;
}
