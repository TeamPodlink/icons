# refraction

Every podcast platform's icon, served three ways — by
[Podlink](https://pod.link). In the spirit of
[svgl](https://github.com/pheralb/svgl).

| Facet | What | How it ships |
| --- | --- | --- |
| **Liquid Glass** | Ground-truth renders of real `.icon` bundles by Apple's own Icon Composer renderer, light + dark renditions | Per-icon downloads on the [directory site](https://icons.podlink.com); images served from the immutable CDN prefix `assets.icons.podlink.com/<version>/` |
| **Flat icons** | Hand-drawn 32×32 vectors, 89 platforms | [`@podlink/icons`](packages/icons) — SVG strings + React components |
| **Badges** | "Listen on …" badges, light + dark | `@podlink/icons` static assets |

Flat-era icons could be tiny hand-drawn SVGs. Liquid Glass icons are
continuous fields — refraction, speculars, measured lighting — which no
small vector can carry, so that facet serves exact rendered pixels
(a 32px-CSS icon costs ~2 KB). Six bundles additionally exist as
**procedural recipes**: data modules rendered by a shared ~26 KB engine,
calibrated to 1.8–5.1 visible-RGB RMSE against Apple's renderer.

## Repository layout

```
platforms/<id>/        source of truth: meta.json + icon.svg + badge.svg
                       + .icon bundles — one folder per platform,
                       the unit of contribution
packages/icons         @podlink/icons — flat icons + badges library
packages/refraction    @podlink/refraction — rendered Liquid Glass
                       rasters (generated; exists only in npm tarballs)
packages/engine        procedural render engine + recipes (research)
apps/web               directory website + static JSON API
pipeline               generation + validation scripts
```

## Develop

```sh
pnpm install
pnpm --filter @podlink/icons build   # flat icons + badges (any platform)
pnpm dev                             # site on http://localhost:4173
```

Rendering Liquid Glass assets requires macOS with Icon Composer;
everything else runs anywhere. See [pipeline/README.md](pipeline/README.md)
and [CONTRIBUTING.md](CONTRIBUTING.md).

## Credits & artwork

Site design closely follows [svgl](https://github.com/pheralb/svgl)
(MIT) by [@pheralb](https://github.com/pheralb). Bundle extraction uses
[decant](https://github.com/kylebshr/decant). Code is MIT; **icon
artwork remains the property of each platform's owner** and is
reproduced for identification purposes only — takedown requests are
honored promptly (see CONTRIBUTING.md).
