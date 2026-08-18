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
  /** First-addition date (YYYY-MM-DD), mined from git history — the
   *  original TeamPodlink/badges repo or this repo, whichever is
   *  earlier. Drives the directory's "Sort by latest". */
  added: string | null;
  /** OP3 top-apps download share (percent), from the committed
   *  apps/web/lib/op3-popularity.json snapshot
   *  (pipeline/fetch-popularity.mjs). null when OP3 has no data for
   *  the platform. Drives the directory's "Sort by popular". */
  popularity: number | null;
  /** Position in the Popular sort: curated pins (snapshot adjustments) + OP3 share order. */
  popularityRank: number | null;
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
  "adaptive-icon": "adaptive icon",
  "adaptive-icon-split": "adaptive icon split",
  "flat-svg": "svg layer",
  "flat-svg-split": "svg split",
  "flat-svg-browser": "browser raster",
  "flat-svg-raster": "browser raster",
};

/**
 * Human label for a bundle's provenance rung. Informational only —
 * provenance is shown on cards as a muted label, never as a lens.
 */
export function sourceLabel(b: GlassBundle): string | null {
  return b.source ? SOURCE_LABEL[b.source] ?? b.source : null;
}

/** Sources hand-drawn by a maintainer rather than lifted from the app's
 *  own shipped artwork (decanted / store artwork / adaptive-icon rungs). */
const HAND_DRAWN_SOURCES = new Set([
  "flat-svg",
  "flat-svg-split",
  "flat-svg-browser",
  "flat-svg-raster",
]);

/**
 * Lenses that describe the platform rather than a single bundle. They
 * chip on every one of the platform's cards (all facets) and are counted
 * by platform in getCategories(); bundle-level lenses count cards.
 */
const PLATFORM_LENSES = new Set([
  "missing flat",
  "missing badge",
  "missing url",
  "inactive",
]);

export function isPlatformLens(cat: string): boolean {
  return PLATFORM_LENSES.has(cat);
}

/**
 * QA lenses: every category is an actionable worklist of identifiable
 * problems — informational facts (provenance, feature coverage) are data
 * on the card, not lenses. Bundle-level: "missing dark" is the
 * dark-variant backlog (light artwork whose Apple-darkened rendition we
 * don't have yet; artwork measured as natively dark is correct as-is and
 * not flagged — split: pipeline/audit-dark-status.mjs); "hand-drawn art"
 * is the re-sourcing backlog (bundles built from maintainer-drawn SVG
 * before the official-artwork-only doctrine). Platform-level (see
 * PLATFORM_LENSES for count semantics): "missing flat" / "missing badge"
 * are the artwork queues for platforms without a flat icon or badge,
 * "missing url" the meta.json website-link backfill, and "inactive"
 * retired platforms (0 today; kept for future retirements).
 */
export function debugCategories(p: Platform, b: GlassBundle | null): string[] {
  const cats: string[] = [];
  if (b) {
    if (!b.hasDark && b.darkStatus !== "native") cats.push("missing dark");
    if (b.source && HAND_DRAWN_SOURCES.has(b.source))
      cats.push("hand-drawn art");
  }
  if (!p.hasFlat) cats.push("missing flat");
  if (!p.hasBadge) cats.push("missing badge");
  if (!p.url) cats.push("missing url");
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
  /** Platform first-addition date (YYYY-MM-DD) — see Platform.added. */
  added: string | null;
  /** OP3 download share (percent) — see Platform.popularity. */
  popularity: number | null;
  /** Position in the Popular sort: curated pins (snapshot adjustments) + OP3 share order. */
  popularityRank: number | null;
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
      added: p.added,
      popularity: p.popularity,
      popularityRank: p.popularityRank,
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
        added: p.added,
        popularity: p.popularity,
        popularityRank: p.popularityRank,
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

/**
 * Where liquid glass raster assets are served from. Production builds set
 * VITE_ASSET_BASE to the immutable R2 release prefix
 * (https://assets.icons.podlink.com/<version>); locally the pipeline syncs
 * rendered assets into public/library.
 */
export const ASSET_BASE = import.meta.env.VITE_ASSET_BASE ?? "/library";

/**
 * Nonzero lenses with truthful counts: platform-level lenses count
 * platforms (a multi-variant platform is one problem, not several);
 * bundle-level lenses count cards. Lens pages still list every card of a
 * member platform.
 */
export function getCategories(): { name: string; count: number }[] {
  const members = new Map<string, Set<string>>();
  for (const c of cards)
    for (const cat of c.categories) {
      if (!c.platform.active && cat !== "inactive") continue;
      const key = isPlatformLens(cat) ? c.platform.id : c.key;
      let set = members.get(cat);
      if (!set) members.set(cat, (set = new Set()));
      set.add(key);
    }
  return [...members.entries()]
    .map(([name, set]) => ({ name, count: set.size }))
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

/** "Listen on" badge SVG path for a platform id (light + dark pair). */
export function badgePath(id: string, dark = false): string {
  return `/badges/${id}-${dark ? "dark" : "light"}.svg`;
}

/**
 * Which artwork the directory grid shows. "glass" is the default (one
 * card per bundle); "flat" and "badge" show the platform-level facets.
 */
export type Facet = "glass" | "flat" | "badge";

export function parseFacet(raw: string | null): Facet {
  return raw === "flat" || raw === "badge" ? raw : "glass";
}

/**
 * Card list for a facet view. Glass keeps one card per bundle; flat and
 * badge dedupe to one card per platform (those assets are per-platform,
 * so a platform with several bundle variants gets a single card).
 * Platforms missing the facet stay listed — the card renders an explicit
 * gap so catalog holes remain visible.
 */
export function facetCards(list: Card[], facet: Facet): Card[] {
  if (facet === "glass") return list;
  const seen = new Set<string>();
  return list.filter((c) => {
    if (seen.has(c.platform.id)) return false;
    seen.add(c.platform.id);
    return true;
  });
}
