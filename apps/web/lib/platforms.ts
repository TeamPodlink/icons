import raw from "./platforms.gen.json";

export interface GlassBundle {
  slug: string;
  title: string;
  variant: string | null;
  recipe: boolean;
  rmse: number | null;
  hasDark: boolean;
}

export interface Platform {
  id: string;
  name: string;
  active: boolean;
  url: string | null;
  guidelinesUrl: string | null;
  categories: string[];
  hasFlat: boolean;
  hasBadge: boolean;
  bundles: GlassBundle[];
}

export const platforms: Platform[] = raw as Platform[];

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
}

export const cards: Card[] = platforms.flatMap((p): Card[] => {
  if (p.bundles.length > 0)
    return p.bundles.map((b) => ({
      key: b.slug,
      title: b.title,
      platform: p,
      facet: "glass",
      bundle: b,
    }));
  if (p.hasFlat)
    return [{ key: p.id, title: p.name, platform: p, facet: "flat", bundle: null }];
  return [];
});

export const glassCards = cards.filter((c) => c.facet === "glass");

/** Where liquid glass raster assets are served from. */
export const ASSET_BASE = process.env.NEXT_PUBLIC_ASSET_BASE ?? "/library";

export function getCategories(): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const c of cards)
    for (const cat of c.platform.categories)
      counts.set(cat, (counts.get(cat) ?? 0) + 1);
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
    c.platform.categories.some((cat) => categorySlug(cat) === slug)
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
