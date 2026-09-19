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
  /** Facet drift: central-crop RMSE between the light Liquid Glass master
   *  and the flat icon, from the committed snapshot
   *  apps/web/lib/facet-drift.json (pipeline/audit-facet-drift.mjs
   *  --write). null when unmeasured (no flat, or snapshot predates the
   *  bundle). Drives the dev-only "Drift" sort. */
  drift: number | null;
  /** The same audit against the bundle rendered with its material off
   *  (audit-facet-drift.mjs --material-off): the artwork-only drift of a
   *  material pair. Null for pairs without material — their master is
   *  already material-free — and until the audit has run with the flag. */
  driftMaterialOff: number | null;
  /** App Store id from meta.json, when the platform ships an iOS app we
   *  have identified. Drives the dev-only "Raster" facet: the store's own
   *  1024 marketing icon (pipeline/fetch-appstore-artwork.mjs →
   *  public/raster/<slug>.png, generated, gitignored). */
  appStoreId: number | null;
  /** Google Play package name, for an Android-only platform: the same
   *  Raster facet, the Play listing's 512 icon. */
  playStoreId: string | null;
  /** What the drift IS, from the committed apps/web/lib/drift-diagnosis.json
   *  snapshot (pipeline/audit-drift-diagnosis.mjs --write): primary cause
   *  plus every cause that fired — material | artwork | plate | registration
   *  | geometry | shading, or floor when central <= 5. null when
   *  undiagnosed. Drives the dev-only "drift: …" lenses. */
  diagnosis: { primary: DriftCause; causes: DriftCause[] } | null;
}

export type DriftCause =
  | "material" | "artwork" | "colour" | "plate" | "registration" | "filter" | "geometry" | "shading" | "floor";
/** Lens label per cause, in the order the worklist should be read. */
export const DRIFT_LENSES: Record<Exclude<DriftCause, "floor">, string> = {
  registration: "drift: registration",
  plate: "drift: plate",
  filter: "drift: filter",
  geometry: "drift: geometry",
  artwork: "drift: artwork",
  colour: "drift: colour",
  shading: "drift: shading",
  material: "drift: material",
};

export interface Platform {
  id: string;
  name: string;
  active: boolean;
  /** Old/alternate spellings from meta.json — resolvePlatform() accepts
   *  them so /icon/<alias> deep links keep working. */
  aliases: string[];
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
  /** Where icon.svg came from — meta.json `flatSource`: "official" is a
   *  vector the brand published (brand kit, site logo, source repo);
   *  "drawn" is ours, whether hand-drawn or measured off a raster. null
   *  = not yet attested. Provenance only; the bundle's `source` says how
   *  the Liquid Glass bundle was BUILT, which is a different question. */
  flatSource: "official" | "drawn" | null;
  /** Facets whose assets are pixels rather than vectors: "glass" when a
   *  bundle's Assets/ holds anything but SVG, "flat" / "badge" when that
   *  SVG embeds an <image>. Empty = every facet is vector. Derived by
   *  pipeline/build-data.mjs; drives the dev-only "raster elements" lens. */
  rasterFacets: ("glass" | "flat" | "badge")[];
  bundles: GlassBundle[];
}

export const platforms: Platform[] = raw as Platform[];

/** Same flat-lowercase normalization @podlink/icons uses for
 *  resolvePlatformId: trim, lowercase, strip everything non-alphanumeric
 *  ("Amazon Music" / "amazon-music" → "amazonmusic"). */
function normalizePlatformInput(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const platformIdMap = new Map<string, Platform>();
for (const p of platforms) {
  platformIdMap.set(normalizePlatformInput(p.id), p);
  for (const alias of p.aliases)
    platformIdMap.set(normalizePlatformInput(alias), p);
}

/** Resolve a /icon/:id route param — canonical id or meta.json alias,
 *  any casing/punctuation — to its platform. */
export function resolvePlatform(input: string): Platform | undefined {
  return platformIdMap.get(normalizePlatformInput(input));
}

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

/**
 * Lenses that describe the platform rather than a single bundle. They
 * chip on every one of the platform's cards (all facets) and are counted
 * by platform in getCategories(); bundle-level lenses count cards.
 */
const PLATFORM_LENSES = new Set([
  "raster elements",
  "missing flat",
  "missing badge",
  "missing url",
  "inactive",
]);

export function isPlatformLens(cat: string): boolean {
  return PLATFORM_LENSES.has(cat);
}

/**
 * QA lenses are MAINTAINER TOOLING, not visitor-facing navigation: they
 * are worklists of our own gaps ("missing badge", "raster elements"),
 * and a released site has no use for them — so they are gated to dev by
 * default. `VITE_SHOW_LENSES=1` forces them on for a deployed preview.
 *
 * Both env reads fold to a constant at build time, so a production
 * build genuinely DROPS the lens machinery rather than merely hiding
 * it: with the flag off, `debugCategories` loses its only callers below
 * and the bundler shakes it out with its label strings (measured — the
 * lens labels are absent from dist/assets/index-*.js). Declared here,
 * above `cards`, because that eager `flatMap` reads it.
 */
export const lensesEnabled =
  import.meta.env.DEV || import.meta.env.VITE_SHOW_LENSES === "1";

/**
 * QA lenses: every category is an actionable worklist of identifiable
 * problems — informational facts (provenance, feature coverage) are data
 * on the card, not lenses. Bundle-level: "missing dark" is the
 * dark-variant backlog (light artwork whose Apple-darkened rendition we
 * don't have yet; artwork measured as natively dark is correct as-is and
 * not flagged — split: pipeline/audit-dark-status.mjs). Platform-level
 * (see PLATFORM_LENSES for count semantics): "raster elements" is the
 * vectorisation backlog — platforms with at least one facet built from
 * pixels (`rasterFacets` non-empty: a bundle with PNG layers, or a flat /
 * badge SVG that embeds an <image>), to be replaced whenever a vector of
 * the mark turns up or can be measured off the raster. It replaces the
 * former "hand-drawn art" lens (flats with `flatSource: "drawn"`), which
 * flagged provenance rather than a gap — a measured drawing is a finished
 * facet, not a worklist item, and `flatSource` stays on the card as data;
 * "missing flat" / "missing badge"
 * are the artwork queues for platforms without a flat icon or badge,
 * "missing url" the meta.json website-link backfill, and "inactive"
 * retired platforms (0 today; kept for future retirements).
 */
export function debugCategories(p: Platform, b: GlassBundle | null): string[] {
  const cats: string[] = [];
  if (b) {
    if (!b.hasDark && b.darkStatus !== "native") cats.push("missing dark");
    // Drift worklists by method (bundle-level): every cause that fired,
    // so a pair that is both mis-registered and off-plate shows in both.
    for (const cause of b.diagnosis?.causes ?? [])
      if (cause !== "floor") cats.push(DRIFT_LENSES[cause]);
  }
  if (p.rasterFacets.length > 0) cats.push("raster elements");
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
  /** Facet drift of the card's bundle — see GlassBundle.drift; null for flat-only cards. */
  drift: number | null;
  /** See GlassBundle.driftMaterialOff. */
  driftMaterialOff: number | null;
}

export const cards: Card[] = platforms.flatMap((p): Card[] => {
  if (p.bundles.length > 0)
    return p.bundles.map((b) => ({
      key: b.slug,
      title: b.title,
      platform: p,
      facet: "glass",
      bundle: b,
      categories: lensesEnabled ? debugCategories(p, b) : [],
      added: p.added,
      popularity: p.popularity,
      popularityRank: p.popularityRank,
      drift: b.drift,
      driftMaterialOff: b.driftMaterialOff,
    }));
  if (p.hasFlat)
    return [
      {
        key: p.id,
        title: p.name,
        platform: p,
        facet: "flat",
        bundle: null,
        categories: lensesEnabled ? debugCategories(p, null) : [],
        added: p.added,
        popularity: p.popularity,
        popularityRank: p.popularityRank,
        drift: null,
        driftMaterialOff: null,
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
  if (!lensesEnabled) return [];
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
  if (!lensesEnabled) return [];
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

/** What the directory grid can show: the three facets plus, in dev only,
 *  "compare" — one card per bundle with a flat, rendering the
 *  facet-drift audit's 4×|glass − vector| panel (CompareArtwork) so the
 *  whole catalogue's residuals can be read at a glance. Not a Facet: no
 *  assets of its own (its menus are the glass bundle's), gated like the
 *  QA lenses. */
export type GridFacet = Facet | "compare" | "raster";

/** What a menu can act on: the three facets, or the dev-only store
 *  raster (its own PNG). */
export type AssetFacet = Facet | "raster";

/** The assets a grid facet's menus act on: compare offers the glass
 *  bundle's, as the detail's compare segment does; raster its own PNG. */
export const assetFacetOf = (facet: GridFacet): AssetFacet =>
  facet === "compare" ? "glass" : facet;

/** The dev-only Raster facet's image: the App Store's 1024 artwork, or
 *  Google Play's 512 icon for an Android-only platform. */
export function rasterPath(slug: string): string {
  return `/raster/${slug}.png`;
}

/** Which store the Raster facet's image came from, for captions. */
export function rasterSource(b: GlassBundle): string | null {
  if (b.appStoreId != null) return `App Store artwork · id ${b.appStoreId}`;
  if (b.playStoreId != null) return `Google Play artwork · ${b.playStoreId}`;
  return null;
}

export function parseFacet(raw: string | null): GridFacet {
  if (raw === "flat" || raw === "badge") return raw;
  // "compare" is a grid facet only on the dev server (see GridFacet).
  if (raw === "compare" && lensesEnabled) return "compare";
  if (raw === "raster" && lensesEnabled) return "raster";
  return "glass";
}

/**
 * Facet coverage counts for the sidebar: glass counts directory cards
 * (one per bundle, flat fallbacks included); flat and badge count the
 * active platforms that actually ship that facet.
 */
export const facetCounts: Record<GridFacet, number> = {
  glass: visibleCards.length,
  flat: platforms.filter((p) => p.active && p.hasFlat).length,
  badge: platforms.filter((p) => p.active && p.hasBadge).length,
  // dev-only: bundles that have a flat to be compared against
  compare: visibleCards.filter((c) => c.bundle !== null && c.platform.hasFlat).length,
  // dev-only: bundles with an identified App Store id (store artwork fetched)
  raster: visibleCards.filter((c) => c.bundle != null && (c.bundle.appStoreId != null || c.bundle.playStoreId != null)).length,
};

/**
 * Card list for a facet view. Glass keeps one card per bundle; flat and
 * badge dedupe to one card per platform (those assets are per-platform,
 * so a platform with several bundle variants gets a single card).
 * Platforms missing the facet stay listed — the card renders an explicit
 * gap so catalog holes remain visible.
 */
export function facetCards(list: Card[], facet: GridFacet): Card[] {
  if (facet === "glass") return list;
  // compare: one card per bundle, and only pairs the audit can score
  if (facet === "compare")
    return list.filter((c) => c.bundle !== null && c.platform.hasFlat);
  // raster: one card per bundle with an App Store id
  if (facet === "raster")
    return list.filter((c) => c.bundle != null && (c.bundle.appStoreId != null || c.bundle.playStoreId != null));
  // One card per platform, and only platforms that ship the facet — the
  // grid shows what exists; gaps are the missing-flat/badge lenses' job.
  const seen = new Set<string>();
  return list.filter((c) => {
    if (facet === "flat" ? !c.platform.hasFlat : !c.platform.hasBadge)
      return false;
    if (seen.has(c.platform.id)) return false;
    seen.add(c.platform.id);
    return true;
  });
}
