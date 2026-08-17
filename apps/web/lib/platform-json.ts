import { debugCategories, type Platform } from "@/lib/platforms";

/** REST representation: metadata + absolute asset/registry URLs per facet. */
export function platformJson(origin: string, p: Platform) {
  const glassAssets = (slug: string, hasDark: boolean) => ({
    png1024: `${origin}/library/${slug}.png`,
    webp256: `${origin}/library/${slug}-256.webp`,
    webp128: `${origin}/library/${slug}-128.webp`,
    webp64: `${origin}/library/${slug}-64.webp`,
    ...(hasDark
      ? {
          darkPng1024: `${origin}/library/${slug}-dark.png`,
          darkWebp256: `${origin}/library/${slug}-dark-256.webp`,
          darkWebp128: `${origin}/library/${slug}-dark-128.webp`,
          darkWebp64: `${origin}/library/${slug}-dark-64.webp`,
        }
      : {}),
  });
  return {
    id: p.id,
    name: p.name,
    url: p.url,
    active: p.active,
    /** Computed QA lenses (union over bundles), not editorial taxonomy. */
    categories: [
      ...new Set(p.bundles.flatMap((b) => debugCategories(p, b))),
    ],
    flatIcon: p.hasFlat ? `${origin}/flat/${p.id}.svg` : null,
    badges: p.hasBadge
      ? {
          light: `${origin}/badges/${p.id}-light.svg`,
          dark: `${origin}/badges/${p.id}-dark.svg`,
        }
      : null,
    liquidGlass: p.bundles.map((b) => ({
      slug: b.slug,
      title: b.title,
      variant: b.variant,
      recipe: b.recipe,
      rmse: b.rmse,
      hasDark: b.hasDark,
      source: b.source,
      assets: glassAssets(b.slug, b.hasDark),
      registryItem: `${origin}/r/${b.slug}.json`,
      shadcn: `npx shadcn@latest add @refraction/${b.slug}`,
    })),
  };
}
