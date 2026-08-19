// The hard-won hotlink embed pattern, productized: one copy action puts a
// complete, correct <picture> on the clipboard instead of asking people to
// assemble URL patterns by hand.

/** What the embed needs to know about a bundle. */
export interface EmbedBundle {
  /** Bundle slug — the asset filename stem, e.g. "overcast". */
  slug: string;
  /** Display name for the alt text, e.g. "Overcast". */
  title: string;
  /** Whether a distinct dark rendition exists (adds the
   *  prefers-color-scheme sources). */
  hasDark: boolean;
}

/** Absolute asset base for copied markup: the production R2 release
 *  prefix when configured (VITE_ASSET_BASE), else the dev origin's
 *  /library — copied embeds must always be absolute URLs. */
export function embedAssetBase(): string {
  const base = import.meta.env.VITE_ASSET_BASE as string | undefined;
  return base && /^https?:\/\//.test(base)
    ? base.replace(/\/$/, "")
    : `${window.location.origin}/library`;
}

const escapeAttr = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/**
 * Complete <picture> embed for a Liquid Glass bundle: AVIF + WebP sources
 * (64px 1x / 128px 2x), dark renditions via prefers-color-scheme sources
 * only when the bundle ships them (order matters — media-qualified
 * sources must precede the unqualified ones), and a plain 64px WebP <img>
 * fallback with intrinsic size, alt, and lazy loading.
 *
 * Pure given (bundle, base) — `base` defaults to embedAssetBase().
 */
export function embedHtml(
  bundle: EmbedBundle,
  base: string = embedAssetBase()
): string {
  const url = (dark: boolean, size: 64 | 128, ext: "avif" | "webp") =>
    `${base}/${bundle.slug}${dark ? "-dark" : ""}-${size}.${ext}`;
  const srcset = (dark: boolean, ext: "avif" | "webp") =>
    `${url(dark, 64, ext)} 1x, ${url(dark, 128, ext)} 2x`;
  const source = (dark: boolean, ext: "avif" | "webp") =>
    `  <source${dark ? ' media="(prefers-color-scheme: dark)"' : ""} type="image/${ext}" srcset="${srcset(dark, ext)}">`;

  const lines = ["<picture>"];
  if (bundle.hasDark) {
    lines.push(source(true, "avif"), source(true, "webp"));
  }
  lines.push(
    source(false, "avif"),
    source(false, "webp"),
    `  <img src="${url(false, 64, "webp")}" alt="${escapeAttr(bundle.title)} app icon" width="64" height="64" loading="lazy">`,
    "</picture>"
  );
  return lines.join("\n");
}
