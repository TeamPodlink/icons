// Copy / Download menu trees per variant, shared by the detail toolbar's
// anchored dropdowns and the grid card's context menu so the two stay in
// lockstep. Everything is scoped to the VISIBLE icon — the current theme
// dictates which rendition the actions resolve to, and the menus never
// offer the other mode. The one designed exception is Embed HTML on
// glass: the copied <picture> markup is inherently light+dark aware, so
// it isn't a mode choice at all. Filenames stay asset-accurate (e.g.
// overcast-dark-64.avif when the dark rendition is what's visible).
// Download carries the variant's full filetype and size range, with the
// AVIF/WebP size matrices as nested submenus.

import {
  CodeXml,
  Copy,
  Download,
  FileImage,
  FolderOpen,
  Image as ImageIcon,
} from "lucide-react";
import type { ContextMenuItem } from "@/components/context-menu";
import {
  copyImage,
  copySvg,
  copyText,
  downloadAsset,
} from "@/lib/asset-actions";
import { embedHtml } from "@/lib/embed-html";
import {
  assetPath,
  badgePath,
  flatPath,
  type Facet,
  type GlassBundle,
  type Platform,
} from "@/lib/platforms";

const SIZES = [32, 64, 128, 256, 512] as const;

/** Whether the glass artwork on screen is the dark rendition: dark theme
 *  AND the bundle actually ships one (light-only bundles show the same
 *  asset in both themes). */
const glassDark = (bundle: GlassBundle, darkTheme: boolean) =>
  darkTheme && bundle.hasDark;

/** One AVIF/WebP size submenu: 32…512 of the visible rendition. */
function sizeRows(
  bundle: GlassBundle,
  format: "avif" | "webp",
  dark: boolean
): ContextMenuItem[] {
  return SIZES.map((size) => ({
    label: `${size} px`,
    onSelect: () =>
      downloadAsset(
        assetPath(bundle.slug, { size, dark, format }),
        `${bundle.slug}${dark ? "-dark" : ""}-${size}.${format}`
      ),
  }));
}

function glassCopyItems(
  bundle: GlassBundle,
  darkTheme: boolean
): ContextMenuItem[] {
  const dark = glassDark(bundle, darkTheme);
  return [
    {
      label: "PNG 1024",
      icon: ImageIcon,
      onSelect: () =>
        copyImage(
          assetPath(bundle.slug, { dark }),
          `${bundle.title} — 1024px PNG${dark ? " (dark)" : ""}`
        ),
    },
    {
      label: "Embed HTML",
      icon: CodeXml,
      onSelect: () =>
        copyText(embedHtml(bundle), `${bundle.title} — <picture> embed`),
    },
  ];
}

function glassDownloadItems(
  bundle: GlassBundle,
  darkTheme: boolean
): ContextMenuItem[] {
  const dark = glassDark(bundle, darkTheme);
  return [
    {
      label: "PNG 1024",
      icon: ImageIcon,
      onSelect: () =>
        downloadAsset(
          assetPath(bundle.slug, { dark }),
          `${bundle.slug}${dark ? "-dark" : ""}.png`
        ),
    },
    {
      label: "AVIF",
      icon: FileImage,
      children: sizeRows(bundle, "avif", dark),
    },
    {
      label: "WebP",
      icon: FileImage,
      children: sizeRows(bundle, "webp", dark),
    },
  ];
}

function vectorCopyItems(platform: Platform): ContextMenuItem[] {
  return [
    {
      label: "SVG",
      icon: FileImage,
      onSelect: () =>
        copySvg(flatPath(platform.id), `${platform.name} — flat SVG`),
    },
  ];
}

function vectorDownloadItems(platform: Platform): ContextMenuItem[] {
  return [
    {
      label: "SVG",
      icon: FileImage,
      onSelect: () =>
        downloadAsset(flatPath(platform.id), `${platform.id}.svg`),
    },
  ];
}

function badgeCopyItems(
  platform: Platform,
  darkTheme: boolean
): ContextMenuItem[] {
  return [
    {
      label: "SVG",
      icon: FileImage,
      onSelect: () =>
        copySvg(
          badgePath(platform.id, darkTheme),
          `${platform.name} — ${darkTheme ? "dark" : "light"} badge SVG`
        ),
    },
  ];
}

function badgeDownloadItems(
  platform: Platform,
  darkTheme: boolean
): ContextMenuItem[] {
  return [
    {
      label: "SVG",
      icon: FileImage,
      onSelect: () =>
        downloadAsset(
          badgePath(platform.id, darkTheme),
          `${platform.id}-${darkTheme ? "dark" : "light"}.svg`
        ),
    },
  ];
}

/** Copy options for the variant on screen (theme-scoped). */
export function copyItemsFor(
  facet: Facet,
  platform: Platform,
  bundle: GlassBundle | null,
  darkTheme: boolean
): ContextMenuItem[] {
  if (facet === "glass") return bundle ? glassCopyItems(bundle, darkTheme) : [];
  if (facet === "badge") return badgeCopyItems(platform, darkTheme);
  return vectorCopyItems(platform);
}

/** Dev server only: reveal the facet's source in Finder through the
 *  vite.config.ts /__reveal middleware (the .icon bundle for glass,
 *  icon.svg for vector, badge.svg for badge). import.meta.env.DEV folds
 *  at build time, so a production build drops the row and its fetch. */
function revealItems(
  facet: Facet,
  platform: Platform,
  bundle: GlassBundle | null
): ContextMenuItem[] {
  if (!import.meta.env.DEV) return [];
  return [
    {
      label: "Open in Finder",
      icon: FolderOpen,
      onSelect: () => {
        const q = new URLSearchParams({ platform: platform.id, facet });
        if (bundle) q.set("slug", bundle.slug);
        void fetch(`/__reveal?${q}`);
      },
    },
  ];
}

/** The one context-menu tree for a facet on screen — Copy ▸, Download ▸
 *  and, on the dev server, Open in Finder. The detail's hero menu IS this
 *  list; the grid card prepends "Open details" to the same list, so the
 *  two can never drift apart. Empty when the facet has no assets. */
export function menuItemsFor(
  facet: Facet,
  platform: Platform,
  bundle: GlassBundle | null,
  darkTheme: boolean
): ContextMenuItem[] {
  const copy = copyItemsFor(facet, platform, bundle, darkTheme);
  const download = downloadItemsFor(facet, platform, bundle, darkTheme);
  if (!copy.length && !download.length) return [];
  return [
    { label: "Copy", icon: Copy, children: copy },
    { label: "Download", icon: Download, children: download },
    ...revealItems(facet, platform, bundle),
  ];
}

/** The full download range for the variant on screen (theme-scoped). */
export function downloadItemsFor(
  facet: Facet,
  platform: Platform,
  bundle: GlassBundle | null,
  darkTheme: boolean
): ContextMenuItem[] {
  if (facet === "glass")
    return bundle ? glassDownloadItems(bundle, darkTheme) : [];
  if (facet === "badge") return badgeDownloadItems(platform, darkTheme);
  return vectorDownloadItems(platform);
}
