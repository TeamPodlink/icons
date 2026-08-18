# @podlink/refraction

Rendered Liquid Glass podcast app icons. Every file is derived from a
`.icon` bundle (see `platforms/*/` in the repo) by Apple's own Icon
Composer renderer — ground-truth pixels, not approximations.

This package is **private render staging**, not an npm delivery: the
`version` field names the release, `pipeline/build-assets.mjs` renders
into `assets/` (gitignored), and `pipeline/upload-assets.mjs` publishes
the files to Cloudflare R2 under the immutable prefix
`https://assets.icons.podlink.com/<version>/`. Bump the version here for
every new render — release prefixes are never overwritten.

Per bundle slug (see `manifest.json` for the full list):

```
assets/<slug>.png            1024px master (light)
assets/<slug>-{32,64,128,256,512}.avif   AVIF-primary sized set
assets/<slug>-{32,64,128,256,512}.webp   WebP fallback set
assets/<slug>-dark*.png/webp same set, Dark rendition — only present
                             when it differs from light
```

Default bundles are named by platform id (`overcast`, `pocketcasts`);
an alternate icon would append its variant (`-dark`, `-pride`).

## Use from the CDN

```
https://assets.icons.podlink.com/<version>/overcast-128.avif
```

The prefix is immutable and served with
`Cache-Control: public, max-age=31536000, immutable`.

## Bulk download

`node pipeline/upload-assets.mjs --zip <out>` produces a flat
`assets-<version>.zip` (all files + `manifest.json`) for attaching to
the GitHub Release. For individual icons, the directory site
(icons.podlink.com) offers per-card downloads.

Icon artwork remains the property of each app's owner; it is reproduced
here for identification purposes.
