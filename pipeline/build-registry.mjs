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
const CDN = `https://cdn.jsdelivr.net/npm/@podlink/refraction@${assetsPkg.version}/assets`;

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
 * Self-hosting (recommended):
 *   npm i @podlink/refraction
 *   cp -R node_modules/@podlink/refraction/assets public/refraction
 * then change ASSET_BASE to "/refraction".
 */
import * as React from "react";

const ASSET_BASE = "${CDN}";

const SIZES = [64, 128, 256] as const;

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

function variant(px: number): string {
  const v = SIZES.find((s) => s >= px);
  return v ? \`-\${v}.webp\` : ".png";
}

function srcSet(slug: string, size: number, dark: boolean) {
  const d = dark ? "-dark" : "";
  const one = \`\${ASSET_BASE}/\${slug}\${d}\${variant(size)}\`;
  const two = \`\${ASSET_BASE}/\${slug}\${d}\${variant(size * 2)}\`;
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
  const light = srcSet(slug, size, false);
  const common = {
    width: size,
    height: size,
    alt,
    loading: "lazy" as const,
    decoding: "async" as const,
  };

  if (!hasDark) {
    return <img {...light} {...common} className={className} {...rest} />;
  }

  const dark = srcSet(slug, size, true);

  if (theme === "class") {
    return (
      <>
        <img
          {...light}
          {...common}
          className={\`dark:hidden \${className ?? ""}\`}
          {...rest}
        />
        <img
          {...dark}
          {...common}
          className={\`hidden dark:block \${className ?? ""}\`}
          {...rest}
        />
      </>
    );
  }

  return (
    <picture>
      <source
        media="(prefers-color-scheme: dark)"
        srcSet={dark.srcSet}
        width={size}
        height={size}
      />
      <img {...light} {...common} className={className} {...rest} />
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
