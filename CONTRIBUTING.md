# Contributing

Every podcast platform lives in one folder: `platforms/<id>/`.

```
platforms/overcast/
  meta.json            name, url, aliases, guidelinesUrl,
                       liquidGlass bundle list
  icon.svg             flat 32×32 vector icon
  badge.svg            badge artwork (badge-dark.svg if it differs)
  Overcast.icon/       Liquid Glass bundle (Icon Composer format);
                       any alternate would live beside the default
```

Platform ids are flat lowercase (`pocketcasts`); Liquid Glass bundle
slugs are the platform id, plus `-variant` for any alternate icon
(none shipped today).

## Adding a flat icon or badge

Follow the existing conventions: `icon.svg` is a 32×32 (`viewBox="0 0
32 32"`) square; badges follow the shapes in existing platforms. Run
`pnpm --filter @podlink/icons validate`.

## Adding a Liquid Glass icon

**App developers (preferred):** export your `.icon` file from Icon
Composer or your Xcode project and either attach it to a
[Submit an icon](../../issues/new?template=submit-icon.yml) issue or open
a PR directly. A developer-submitted bundle is authoritative and doubles
as permission to include the icon.

**Everyone else:** open a
[Request an icon](../../issues/new?template=request-icon.yml) issue with
the App Store link. Extraction requires macOS, the installed app, and
tooling ([decant](https://github.com/kylebshr/decant)), so maintainers
handle it.

### PR checklist

1. Put the bundle at `platforms/<id>/<Name>.icon` (no `.DS_Store`,
   under 8 MB). Create the platform folder + `meta.json` if it's new.
2. Register it in `meta.json`:
   ```json
   "liquidGlass": {
     "bundles": [
       { "slug": "<id>", "title": "My App", "variant": null, "file": "MyApp.icon" }
     ]
   }
   ```
3. `node pipeline/validate.mjs` must pass (CI runs it too — structural
   checks only, no Mac required).

Do **not** commit rendered images; maintainers render and publish assets
at release time (see below).

## Releases (maintainers, macOS + Icon Composer)

```sh
node pipeline/build-assets.mjs     # render light+dark, set hasDark flags
node pipeline/validate.mjs
pnpm --filter @podlink/icons build # flat icons + badges + lib
pnpm --filter web build            # sanity: data + registry + site
# bump version in packages/refraction/package.json
npm publish --access public ./packages/refraction
# regenerate the registry so components pin the new version, then deploy
node pipeline/build-registry.mjs
```

For new all-SVG-layer bundles, also run the recipe pipeline (see
`pipeline/README.md`) and record the printed RMSE in `meta.json`.

Visually spot-check new icons (light and dark) before publishing.

## Artwork policy

The code in this repository is MIT-licensed. **Icon artwork is not
ours** — it remains the property of each platform's owner and is
reproduced for identification purposes only, as podcast directories have
always done with app badges. Only official, current icons are accepted
(no fan redesigns, no mockups). If you own an icon shown here and want
it removed, open an issue or email the maintainer and it will be removed
promptly.
