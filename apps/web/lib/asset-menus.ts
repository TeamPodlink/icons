import type { VectorShape } from "./vector-shape";
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
  rasterPath,
  type AssetFacet,
  type Facet,
  type GlassBundle,
  type Platform,
} from "@/lib/platforms";

const SIZES = [32, 64, 128, 256, 512] as const;

/** Whether the glass artwork on screen is the dark rendition: dark theme
 *  AND the bundle actually ships one (light-only bundles show the same
 *  asset in both themes). */
const glassDark = (bundle: GlassBundle, darkTheme: boolean, circle: boolean) =>
  darkTheme && (circle ? bundle.hasCircleDark : bundle.hasDark);

/** One AVIF/WebP size submenu: 32…512 of the visible rendition. */
function sizeRows(
  bundle: GlassBundle,
  format: "avif" | "webp",
  dark: boolean,
  circle = false
): ContextMenuItem[] {
  return SIZES.map((size) => ({
    label: `${size} px`,
    onSelect: () =>
      downloadAsset(
        assetPath(bundle.slug, { size, dark, format, shape: circle ? "circle" : "squircle" }),
        `${bundle.slug}${circle ? "-circle" : ""}${dark ? "-dark" : ""}-${size}.${format}`
      ),
  }));
}

function glassCopyItems(
  bundle: GlassBundle,
  darkTheme: boolean,
  circle = false
): ContextMenuItem[] {
  const dark = glassDark(bundle, darkTheme, circle);
  return [
    {
      label: "PNG 1024",
      icon: ImageIcon,
      onSelect: () =>
        copyImage(
          assetPath(bundle.slug, { dark, shape: circle ? "circle" : "squircle" }),
          `${bundle.title} — 1024px ${circle ? "circle " : ""}PNG${dark ? " (dark)" : ""}`
        ),
    },
    {
      label: "Embed HTML",
      icon: CodeXml,
      onSelect: () =>
        copyText(embedHtml(bundle, undefined, circle), `${bundle.title} — <picture> embed`),
    },
  ];
}

function glassDownloadItems(
  bundle: GlassBundle,
  darkTheme: boolean,
  circle = false
): ContextMenuItem[] {
  const dark = glassDark(bundle, darkTheme, circle);
  return [
    {
      label: "PNG 1024",
      icon: ImageIcon,
      onSelect: () =>
        downloadAsset(
          assetPath(bundle.slug, { dark, shape: circle ? "circle" : "squircle" }),
          `${bundle.slug}${circle ? "-circle" : ""}${dark ? "-dark" : ""}.png`
        ),
    },
    {
      label: "AVIF",
      icon: FileImage,
      children: sizeRows(bundle, "avif", dark, circle),
    },
    {
      label: "WebP",
      icon: FileImage,
      children: sizeRows(bundle, "webp", dark, circle),
    },
  ];
}

function vectorCopyItems(platform: Platform, shape: VectorShape): ContextMenuItem[] {
  return [
    {
      label: "SVG",
      icon: FileImage,
      onSelect: () =>
        copySvg(flatPath(platform.id, shape), `${platform.name} — ${shape} SVG`),
    },
  ];
}

function vectorDownloadItems(platform: Platform, shape: VectorShape): ContextMenuItem[] {
  return [
    {
      label: "SVG",
      icon: FileImage,
      onSelect: () =>
        downloadAsset(flatPath(platform.id, shape), `${platform.id}${shape === "squircle" ? "" : `-${shape}`}.svg`),
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

/** Dev-only Raster facet: the store's own icon (App Store 1024 or Google Play 512) as one PNG. */
function rasterCopyItems(bundle: GlassBundle): ContextMenuItem[] {
  return [
    {
      label: "Store PNG",
      icon: ImageIcon,
      onSelect: () =>
        copyImage(rasterPath(bundle.slug), `${bundle.title} — store PNG`),
    },
  ];
}
function rasterDownloadItems(bundle: GlassBundle): ContextMenuItem[] {
  return [
    {
      label: "Store PNG",
      icon: ImageIcon,
      onSelect: () =>
        downloadAsset(rasterPath(bundle.slug), `${bundle.slug}-store.png`),
    },
  ];
}

/** Copy options for the variant on screen (theme-scoped). */
export function copyItemsFor(
  facet: AssetFacet,
  platform: Platform,
  bundle: GlassBundle | null,
  darkTheme: boolean,
  shape: VectorShape = "squircle"
): ContextMenuItem[] {
  if (facet === "raster") return bundle && (bundle.appStoreId != null || bundle.playStoreId != null) ? rasterCopyItems(bundle) : [];
  if (facet === "glass") return bundle ? glassCopyItems(bundle, darkTheme, shape === "circle") : [];
  if (facet === "badge") return badgeCopyItems(platform, darkTheme);
  return vectorCopyItems(platform, shape);
}

/** Dev server only: reveal the facet's source in Finder through the
 *  vite.config.ts /__reveal middleware (the .icon bundle for glass,
 *  icon.svg for vector, badge.svg for badge). import.meta.env.DEV folds
 *  at build time, so a production build drops the row and its fetch. */
function revealItems(
  facet: AssetFacet,
  platform: Platform,
  bundle: GlassBundle | null
): ContextMenuItem[] {
  if (!import.meta.env.DEV || facet === "raster") return [];
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
  facet: AssetFacet,
  platform: Platform,
  bundle: GlassBundle | null,
  darkTheme: boolean,
  shape: VectorShape = "squircle"
): ContextMenuItem[] {
  const copy = copyItemsFor(facet, platform, bundle, darkTheme, shape);
  const download = downloadItemsFor(facet, platform, bundle, darkTheme, shape);
  if (!copy.length && !download.length) return [];
  return [
    { label: "Copy", icon: Copy, children: copy },
    { label: "Download", icon: Download, children: download },
    ...revealItems(facet, platform, bundle),
  ];
}

/** The full download range for the variant on screen (theme-scoped). */
export function downloadItemsFor(
  facet: AssetFacet,
  platform: Platform,
  bundle: GlassBundle | null,
  darkTheme: boolean,
  shape: VectorShape = "squircle"
): ContextMenuItem[] {
  if (facet === "raster") return bundle && (bundle.appStoreId != null || bundle.playStoreId != null) ? rasterDownloadItems(bundle) : [];
  if (facet === "glass")
    return bundle ? glassDownloadItems(bundle, darkTheme, shape === "circle") : [];
  if (facet === "badge") return badgeDownloadItems(platform, darkTheme);
  return vectorDownloadItems(platform, shape);
}
