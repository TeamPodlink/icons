import { debugCategories, type Platform } from "@/lib/platforms";

/** REST representation: metadata + absolute asset/registry URLs per facet. */
export function platformJson(origin: string, p: Platform) {
  const SIZES = [32, 64, 128, 256, 512] as const;
  const FORMATS = ["avif", "webp"] as const;
  const glassAssets = (slug: string, hasDark: boolean) => {
    const out: Record<string, string> = {
      png1024: `${origin}/library/${slug}.png`,
    };
    for (const f of FORMATS)
      for (const s of SIZES) out[`${f}${s}`] = `${origin}/library/${slug}-${s}.${f}`;
    if (hasDark) {
      out.darkPng1024 = `${origin}/library/${slug}-dark.png`;
      for (const f of FORMATS)
        for (const s of SIZES)
          out[`dark${f[0].toUpperCase()}${f.slice(1)}${s}`] =
            `${origin}/library/${slug}-dark-${s}.${f}`;
    }
    return out;
  };
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
      darkStatus: b.darkStatus,
      source: b.source,
      assets: glassAssets(b.slug, b.hasDark),
      registryItem: `${origin}/r/${b.slug}.json`,
      shadcn: `npx shadcn@latest add @refraction/${b.slug}`,
    })),
  };
}
