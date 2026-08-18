---
name: ipatool
description: Source a platform's icon artwork from the real iOS app — download the IPA with ipatool, check its asset catalog for a genuine Liquid Glass .icon (IconImageStack), and extract it with decant; fall back to the catalog's official 1024px marketing artwork for flat apps. Use whenever adding a platform, sourcing or updating icon artwork, or wondering what an app's icon "really" ships — NEVER hand-author or recreate artwork by eye.
---

# Sourcing icon artwork from the shipped app

House rule: platform artwork comes from **decanted `.icon` bundles or
official App Store artwork mined from the app's own asset catalog** —
never from agent-authored SVG recreations. The app itself is the
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
   single-raster-layer bundle (template: `platforms/wondery/`),
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

## Boundaries

- Flat `icon.svg`/`badge.svg` facets are maintainer-authored; their
  absence is fine (codegen skips platforms without `icon.svg`).
- IPAs and extracted Apple/third-party binaries stay OUT of the repo —
  work in scratch; only the assembled `.icon` bundle (under the 8MB
  cap) is committed, per the artwork policy in CONTRIBUTING.md.
- System (first-party Apple) apps use decant's simulator/IPSW modes
  instead — see `~/Developer/decant/README.md`; nothing of Apple's is
  ever committed.
