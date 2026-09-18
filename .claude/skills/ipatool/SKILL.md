---
name: ipatool
description: Source a platform's icon artwork from the real shipped app — iOS via ipatool (IPA asset catalog, decant for genuine Liquid Glass .icon stacks, marketing artwork for flat apps) or Android via the official APK's adaptive-icon layers (apktool decode, developer foreground/background separation). Use whenever adding a platform, sourcing or updating icon artwork, building a bundle for an Android-only app, or wondering what an app's icon "really" ships — NEVER hand-author or recreate artwork by eye.
---

# Sourcing icon artwork from the shipped app

House rule: platform artwork comes from **decanted `.icon` bundles or
official App Store artwork mined from the app's own asset catalog** —
never from agent-authored SVG recreations. A shipped RASTER layer may
still be replaced by a vector (an official vector, or a measured drawing)
when ictool renders the two within the same-artwork band in both
appearances — "no measurable loss", pipeline/README.md rule entry of
2026-09-18; the raster is the reference, the vector ships. The app itself is the
ground truth for what its icon "really" is; always inspect it before
assuming a platform is flat.

## Tooling (all already on this Mac)

- `ipatool` (`/opt/homebrew/bin/ipatool`) — downloads IPAs from the
  App Store; authenticated as the maintainer's Apple ID
  (`ipatool auth info` to confirm; if auth fails, STOP and ask the
  maintainer to re-auth — do not retry blindly).
- `~/Developer/decant` — Liquid Glass `.icon` extractor
  (host mode works on any `Assets.car`; the local copy carries the
  third-party scaling fix — `natural_size()`/`position_for()` in
  `build-icon.py`).
- `~/Developer/decanted-icons` — the worked procedure + prior
  extractions. Its `README.md` is the authoritative recipe (compile
  `icon-extract.m`, run against `Assets.car` + stack name, assemble
  with `build-icon.py`, verify with an ictool render).
  `tools/flat-icon-extract` + `tools/build_flat_icon.py` mine flat
  apps' marketing icons.
- `assetutil` (Xcode CLT) — catalog inspection.

## Procedure

1. **Resolve + download.**
   `ipatool search "<name>"` / `--bundle-identifier` →
   `ipatool download`. Free app not on the account:
   `ipatool purchase` acquires the $0 license (established workflow).
   **Paid app the account doesn't own: never purchase — report to the
   maintainer and skip.**
2. **Open the catalog.** Unzip the `.ipa` →
   `Payload/<App>.app/Assets.car` (icon catalogs are not
   FairPlay-encrypted).
3. **Check for a real Liquid Glass icon.**
   `assetutil -I <Assets.car>` — an `IconImageStack` entry means the
   app ships a genuine `.icon`. Extract per the decanted-icons README
   (decant host mode), verify with ictool, place at
   `platforms/<id>/<Name>.icon`, register in `meta.json` with
   `source: "decanted"`.
4. **Flat app fallback.** No stack → mine the official 1024px
   marketing icon with `flat-icon-extract`; build the
   single-raster-layer bundle (template: `platforms/icatcher/`),
   `source: "appstore-artwork"`.
5. **Dark art.** While in the catalog, look for genuine ≥1024px dark
   marketing icons (precedent: Deezer, Global Player, Hark, Pandora,
   SiriusXM — monorepo commit `7dce3a6` has the mining rules). Beware:
   180px "dark" renditions are usually CoreUI fallbacks to light —
   pixel-dedupe before adopting. Real dark art becomes a second layer;
   bundles with explicit dark art are never auto-split.
6. **Derived darks + assets.** Qualifying flat bundles get
   Apple-convention dark twins via `pipeline/split-raster-icons.mjs`;
   then `node pipeline/build-assets.mjs` (commits `hasDark` flips) and
   `node pipeline/validate.mjs`.

## Android apps (no iOS build)

Android-only apps get bundles built from the **official APK's
adaptive-icon layers** — the developer's own foreground/background
separation — never from our hand-drawn flat SVGs. Pilot + worked
example: antennapod (commit `d64ded5`).

### Official APK sources, in order

1. **Developer GitHub releases** — a release APK signed/published by
   the developer themselves.
2. **F-Droid official** — `https://f-droid.org/api/v1/packages/<pkg>`
   for versions, then `https://f-droid.org/repo/<pkg>_<code>.apk`.
   (AntennaPod's GitHub releases carry no APK assets; F-Droid was the
   pilot's source.)
3. **apkeep** (`/opt/homebrew/bin/apkeep`, installed 2026-08-18 with
   maintainer approval). What actually works (2026-08-18 round):
   - `-d google-play` with an Aurora-dispenser anonymous token is THE
     working path, and it serves first-party Play APKs:
     `curl -H "User-Agent: com.aurora.store-4.6.3-63"
     https://auroraoss.com/api/auth` → `{email, auth}` →
     `apkeep -a <pkg> -d google-play -e <email> --auth-token <auth>
     --accept-tos out/` (the ToS acceptance is for the dispenser's own
     throwaway account). Failures are SILENT ("Downloading…" then no
     file) — always `ls` the output. Geo/device-gated apps
     (iheartradio) and delisted apps (listennotes) fail this way.
   - `-d apk-pure` (the default) is DEAD: "Invalid app response" for
     every package (and APKPure was reportedly compromised —
     EFForg/apkeep#237 — avoid it regardless).
   - `-d huawei-app-gallery` works anonymously but carries few
     Western apps and stale versions (podcastaddict 2022.2.2h vs Play
     2026.9.1); useful only as a cross-check of signing certs.
   - Mirror websites (Uptodown, APKPure web, APKMirror download pages)
     gate behind Cloudflare Turnstile / bot checks — do not automate
     around them; APKMirror's *browse* pages are curl-able and publish
     cert fingerprints, useful for cross-checking.

**Provenance discipline (mandatory):** for every APK record source,
package id, versionName/versionCode (`apktool.yml`), and the signing
cert SHA-256 in the adoption commit. Modern APKs are v2/v3-signed
(`keytool -printcert -jarfile` prints NOTHING — that is not an
error); use androguard in a scratch venv:
`APK(f).get_certificates_der_v3() or …_v2()` → sha256. Cross-check
against a second source when one exists (APKMirror publishes
fingerprints; AppGallery copies should carry the same key — Podcast
Guru's AppGallery copy did NOT, a different signing key, so prefer
Play).

Paid apps, auth-walled downloads, or anything requiring the
maintainer's own Play account: STOP and ask the maintainer — mirror
the iOS "never purchase" rule.

### Extraction (apktool, installed via brew)

1. `apktool d -f -o decoded <apk>` in scratch.
2. `AndroidManifest.xml` → `android:icon="@mipmap/ic_launcher"` →
   `res/mipmap-anydpi*/ic_launcher.xml` (`<adaptive-icon>`) → its
   `<foreground>`/`<background>` drawable references. Ignore splash /
   animation drawables (`launcher_animate*` etc.) — only the
   adaptive-icon layers are the icon.
3. **Vector layers** (VectorDrawable XML): `pathData` is SVG path
   syntax — convert faithfully, no redrawing:
   `viewportWidth/Height` → `viewBox`; `fillColor` → `fill`;
   `fillType="evenOdd"` → `fill-rule`; `strokeColor/Width` map 1:1;
   gradients in `<aapt:attr>` → SVG gradients with the same stops.
4. **Raster layers**: use the highest-density mipmap (usually
   `mipmap-xxxhdpi`, 432×432 for a 108dp layer).
5. **Plain color background** (`@color`/`#RRGGBB`): that IS the
   canvas fill. A gradient raster that measures as an exact linear
   gradient (check per-row uniformity + linearity) becomes a canvas
   `fill` gradient with stops sampled at the measured crop window.
   **Fill-orientation law (measured 2026-08-18, ledger):** ictool
   IGNORES fill `orientation` start/stop — canvas gradients always
   paint vertically over the full canvas height. Only vertical
   full-height gradients may become canvas fills; diagonal, kinked,
   or radial backgrounds ship as a layer instead (raster baked from
   the exact gradient, or the converted SVG, full-canvas) over a
   plain fill, with opacity-specializations 0 in dark so the gray
   pin shows through (worked examples: audible, spreaker).
6. **Malformation patterns to skip** (inspect before adopting):
   `<foreground>@null` (playerfm — the "adaptive icon" is a bare
   color); layers that encode a DIFFERENT rendition than the official
   store icon (castbox's hexagon-less waveform, podcastguru's
   dark-style vectors — crop-scan RMSE stays huge at every crop size);
   Android Studio template backgrounds (green grid). A delisted app
   (Play page 404) has no official Android distribution to mine.

### Scaling convention (measured, antennapod pilot)

Android composes a 108dp layer canvas and launchers crop the center
~66–72dp. **Measure the app's own framing instead of assuming**: the
official Play Store 512px icon (served from the store page /
play-lh.googleusercontent.com, `=w512-h512`) is typically the
developer's own crop of the same layers.

- Find the crop: RMSE-scan center-crop sizes of the composited
  432px layers resized to 512 against the Play icon (pilot: sharp
  minimum at 273.3px = 68.33dp, centered, RMSE 4.28/255).
- Map to the 1024 canvas: layer scale = `1024 / crop_px`; the layer
  is drawn at `432 × 1024/crop_px` px, centered (crop offsets if the
  scan says non-centered). Fill-gradient stops = layer gradient
  sampled at the crop edges (pilot: fractions 0.183/0.817).
- Verify render-vs-render: put the Play art through ictool as a
  single-raster probe bundle and diff against the new bundle's
  Default render — canvas material lighting cancels out. Pilot
  agreement: RMSE 6.87/255, glyph bbox within 1px, fill within
  1/255. A raw diff against the flat Play PNG measures the Liquid
  Glass sheen, not fidelity — don't use it.
- ALSO run a **self-probe** (2026-08-18 round): the measured crop of
  your own 432 composite, upscaled to 1024, through ictool as the
  same single-raster probe. Self-probe RMSE isolates recomposition
  fidelity (round: 0.4–2.8/255); the Play-probe RMSE additionally
  contains store-export divergence — some developers' Play 512s
  measurably differ from their shipped layers (spreaker's export has
  a weaker glow, audible's a different gradient), and a large
  Play-RMSE with a small self-RMSE means the ART differs, which is a
  skip signal only when the Play/App-Store rendition is the one the
  entry should keep (castbox's hexagon, podcastguru's pastel light).

### Bundle + dark

Background → canvas `fill` (+ standard `gray:0.192→0.078` dark pin);
foreground → glyph layer. Dark follows the measured tint law
(pipeline/README.md ledger): SVG glyphs that pass the near-white gate
ship as a single bare SVG layer (auto-tint); raster glyphs NEVER
auto-tint, so monochrome-paint art gets a baked `glyph-dark.png` —
white-coverage (alpha × whiteness projection over the per-row
background) recolored to the default fill per row, background-matching
pixels knocked out — via the standard opacity-specializations twin.
Colorful art or untintable backgrounds: light-only. Note: layers baked
against the layer gradient (translucent-white arcs etc.) recompose
correctly over the cropped canvas fill — the crop mapping is the bake.
`source: "adaptive-icon"` (or `"adaptive-icon-split"` with a dark
twin). Android's `<monochrome>` themed-icon layer is a different,
differently-scaled artwork — don't substitute it for the tint-law twin.

### Android boundaries

- APKs and decoded resources stay OUT of the repo — scratch only;
  only the assembled `.icon` bundle is committed.
- Every path/color in the bundle must trace to the APK's own
  resources (interpolating the APK's own gradient, or projecting its
  own pixels, is fine; drawing is not).

## Boundaries

- Flat `icon.svg`/`badge.svg` facets are maintainer-authored; their
  absence is fine (codegen skips platforms without `icon.svg`).
- IPAs and extracted Apple/third-party binaries stay OUT of the repo —
  work in scratch; only the assembled `.icon` bundle (under the 8MB
  cap) is committed, per the artwork policy in CONTRIBUTING.md.
- System (first-party Apple) apps use decant's simulator/IPSW modes
  instead — see `~/Developer/decant/README.md`; nothing of Apple's is
  ever committed.
