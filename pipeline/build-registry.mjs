// Generate the shadcn registry served by the website at /r/{name}.json.
//
// Consumers add to components.json:
//   "registries": { "@refraction": "<SITE_URL>/r/{name}.json" }
// then:
//   npx shadcn@latest add @refraction/overcast
//
// Items: liquid-glass-icon (shared base), one per liquid glass bundle,
// and all-icons. Output is gitignored; SITE_URL env sets absolute URLs.

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readBundles, root } from "./lib.mjs";

const OUT = join(root, "apps/web/public/r");
const assetsPkg = JSON.parse(
  readFileSync(join(root, "packages/refraction/package.json"), "utf8")
);

const SITE_URL = process.env.SITE_URL ?? "http://localhost:4173";
// Images live on R2 under an immutable release prefix (see
// pipeline/upload-assets.mjs); the version in
// packages/refraction/package.json names the release.
const CDN = `https://assets.icons.podlink.com/${assetsPkg.version}`;

// Production guard: refuse to generate a registry that points at a release
// prefix that was never uploaded (browsers don't fall back on 404s).
if (process.env.RELEASE_CHECK === "1") {
  const probe = `${CDN}/manifest.json`;
  const res = await fetch(probe, { method: "HEAD" }).catch((e) => ({
    ok: false,
    status: String(e),
  }));
  if (!res.ok) {
    console.error(
      `RELEASE_CHECK failed: HEAD ${probe} -> ${res.status}\n` +
        `Release ${assetsPkg.version} is not on R2 — run ` +
        `\`pnpm release:assets\` (maintainer Mac) before deploying, or ` +
        `fix the version in packages/refraction/package.json.`
    );
    process.exit(1);
  }
  console.log(`release check ok: ${probe}`);
}

// Sizes/formats come from the rendered manifest so the generated component
// always matches the published asset set. Fallback = the last published
// layout, for environments (CI) where assets were never rendered.
let manifest = { sizes: [64, 128, 256], formats: ["webp"] };
try {
  const m = JSON.parse(
    readFileSync(join(root, "packages/refraction/manifest.json"), "utf8")
  );
  manifest = { sizes: m.sizes, formats: m.formats ?? ["webp"] };
} catch {}
const HAS_AVIF = manifest.formats.includes("avif");

function componentName(title) {
  return (
    title
      .split(/[^a-zA-Z0-9]+/)
      .filter(Boolean)
      .map((w) => w[0].toUpperCase() + w.slice(1))
      .join("") + "Icon"
  );
}

// ---------------------------------------------------------------- base
const BASE_COMPONENT = `/*
 * Liquid Glass podcast app icon — ground-truth renders of macOS 26
 * .icon bundles, light + dark.
 *
 * Note: images default to loading="lazy", which also suppresses the
 * hidden variant's fetch in theme="class" mode. If you override
 * loading="eager" (e.g. an above-fold LCP icon), both variants will
 * fetch.
 *
 * Self-hosting (recommended for production): download assets-<version>.zip
 * from the repo's GitHub Release, extract it into public/refraction, then
 * change ASSET_BASE to "/refraction". The default ASSET_BASE below points
 * at the immutable, versioned release prefix on assets.icons.podlink.com.
 */
import * as React from "react";

const ASSET_BASE = "${CDN}";

const SIZES = ${JSON.stringify(manifest.sizes)} as const;
// Baked at generation time from the rendered manifest. AVIF sources are
// emitted only when the published asset set actually contains .avif —
// browsers that choose an AVIF <source> do NOT fall back on a 404.
const HAS_AVIF = ${HAS_AVIF};

export interface LiquidGlassIconProps
  extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src" | "srcSet"> {
  slug: string;
  /** Rendered square size in CSS pixels. @default 32 */
  size?: number;
  /** Whether a distinct dark rendition exists for this icon. */
  hasDark?: boolean;
  /**
   * How dark mode is detected:
   *  - "media": prefers-color-scheme (zero-JS, OS-level)
   *  - "class": Tailwind \`dark\` class strategy (next-themes etc.)
   * @default "media"
   */
  theme?: "media" | "class";
  alt: string;
}

function variant(px: number, ext: "avif" | "webp"): string {
  const v = SIZES.find((s) => s >= px);
  return v ? \`-\${v}.\${ext}\` : ".png";
}

// AVIF is primary (smaller AND more accurate at icon sizes); WebP is the
// fallback for browsers without AVIF support. The master .png serves
// requests beyond the largest generated size.
function srcSet(slug: string, size: number, dark: boolean, ext: "avif" | "webp") {
  const d = dark ? "-dark" : "";
  const one = \`\${ASSET_BASE}/\${slug}\${d}\${variant(size, ext)}\`;
  const two = \`\${ASSET_BASE}/\${slug}\${d}\${variant(size * 2, ext)}\`;
  return { src: one, srcSet: \`\${one} 1x, \${two} 2x\` };
}

export function LiquidGlassIcon({
  slug,
  size = 32,
  hasDark = false,
  theme = "media",
  alt,
  className,
  ...rest
}: LiquidGlassIconProps) {
  const common = {
    width: size,
    height: size,
    alt,
    loading: "lazy" as const,
    decoding: "async" as const,
  };
  const sized = { width: size, height: size };
  const lightAvif = srcSet(slug, size, false, "avif");
  const lightWebp = srcSet(slug, size, false, "webp");

  if (!hasDark) {
    return (
      <picture>
        {HAS_AVIF && (
          <source type="image/avif" srcSet={lightAvif.srcSet} {...sized} />
        )}
        <img {...lightWebp} {...common} className={className} {...rest} />
      </picture>
    );
  }

  const darkAvif = srcSet(slug, size, true, "avif");
  const darkWebp = srcSet(slug, size, true, "webp");

  if (theme === "class") {
    // Visibility classes live on <picture> (suppressing the hidden
    // variant's fetch via loading="lazy"); the caller's className stays
    // on <img>, consistent with the other branches.
    return (
      <>
        <picture className="dark:hidden">
          {HAS_AVIF && (
            <source type="image/avif" srcSet={lightAvif.srcSet} {...sized} />
          )}
          <img {...lightWebp} {...common} className={className} {...rest} />
        </picture>
        <picture className="hidden dark:block">
          {HAS_AVIF && (
            <source type="image/avif" srcSet={darkAvif.srcSet} {...sized} />
          )}
          <img {...darkWebp} {...common} className={className} {...rest} />
        </picture>
      </>
    );
  }

  return (
    <picture>
      {HAS_AVIF && (
        <source
          media="(prefers-color-scheme: dark)"
          type="image/avif"
          srcSet={darkAvif.srcSet}
          {...sized}
        />
      )}
      <source
        media="(prefers-color-scheme: dark)"
        srcSet={darkWebp.srcSet}
        {...sized}
      />
      {HAS_AVIF && (
        <source type="image/avif" srcSet={lightAvif.srcSet} {...sized} />
      )}
      <img {...lightWebp} {...common} className={className} {...rest} />
    </picture>
  );
}
`;

function wrapper(b) {
  const name = componentName(b.title);
  return `import {
  LiquidGlassIcon,
  type LiquidGlassIconProps,
} from "@/components/liquidglass/liquid-glass-icon";

export function ${name}(
  props: Omit<LiquidGlassIconProps, "slug" | "hasDark" | "alt"> & {
    alt?: string;
  }
) {
  return (
    <LiquidGlassIcon
      slug="${b.slug}"${b.hasDark ? "\n      hasDark" : ""}
      alt={props.alt ?? "${b.title} app icon"}
      {...props}
    />
  );
}
`;
}

// ---------------------------------------------------------------- emit
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const baseItem = {
  $schema: "https://ui.shadcn.com/schema/registry-item.json",
  name: "liquid-glass-icon",
  type: "registry:component",
  title: "Liquid Glass Icon",
  description:
    "Base component for Liquid Glass podcast app icons: <picture>/srcset with light + dark renditions.",
  files: [
    {
      path: "components/liquidglass/liquid-glass-icon.tsx",
      content: BASE_COMPONENT,
      type: "registry:component",
    },
  ],
};
writeFileSync(
  join(OUT, "liquid-glass-icon.json"),
  JSON.stringify(baseItem, null, 2)
);

const items = [];
for (const b of readBundles()) {
  const item = {
    $schema: "https://ui.shadcn.com/schema/registry-item.json",
    name: b.slug,
    type: "registry:component",
    title: b.title,
    description: `${b.title} Liquid Glass app icon (${b.platformMeta.name}).`,
    registryDependencies: [`${SITE_URL}/r/liquid-glass-icon.json`],
    files: [
      {
        path: `components/liquidglass/${b.slug}-icon.tsx`,
        content: wrapper(b),
        type: "registry:component",
      },
    ],
  };
  writeFileSync(join(OUT, `${b.slug}.json`), JSON.stringify(item, null, 2));
  items.push(item);
}

const allItem = {
  $schema: "https://ui.shadcn.com/schema/registry-item.json",
  name: "all-icons",
  type: "registry:component",
  title: "All Liquid Glass icons",
  description: "Every Liquid Glass podcast app icon component.",
  registryDependencies: [`${SITE_URL}/r/liquid-glass-icon.json`],
  files: items.flatMap((i) => i.files),
};
writeFileSync(join(OUT, "all-icons.json"), JSON.stringify(allItem, null, 2));

writeFileSync(
  join(OUT, "registry.json"),
  JSON.stringify(
    {
      $schema: "https://ui.shadcn.com/schema/registry.json",
      name: "refraction",
      homepage: SITE_URL,
      items: [baseItem, ...items, allItem].map(({ files, ...meta }) => meta),
    },
    null,
    2
  )
);

console.log(`registry: ${items.length + 2} items -> apps/web/public/r`);
