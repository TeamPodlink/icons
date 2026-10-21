# App Store artwork refresh — October 16, 2026

The App Store's displayed icon can be newer than its iTunes lookup artwork.
Apple Podcasts confirmed this: a fresh lookup download was pixel-identical to
our previous raster, while the primary icon on the public App Store page had
changed highlights, shadows, and transparent squircle corners.

All **65 iOS entries** were refreshed from the current displayed page icon:
**56** changed pixels and **9** remained pixel-identical. Of the changed
images, **55** also changed within the central half; these counts measure
pixel differences, not a claim that every app received a redesign. All five
Android-only cache files remained byte-identical.

Six pages initially returned HTTP 429 (Castro, Deezer, Radio Thmanyah,
RSSRadio, SiriusXM, and Snipd). All succeeded on a slower second pass. The
final set has **zero lookup fallbacks and zero failures**.

## Apple Podcasts confirmation

- [Official listing](https://apps.apple.com/us/app/apple-podcasts/id525463029)
- Lookup metadata: version 4.6, released September 14, 2026. This metadata
  describes the app version; it does not establish when the displayed artwork
  changed or which OS release caused it.
- Old and freshly downloaded lookup rendition: decoded pixel RMSE **0**.
- [Displayed artwork](https://is1-ssl.mzstatic.com/image/thumb/PurpleSource211/v4/fd/c3/02/fdc3025a-c33c-8c8a-82c9-4c09f88c9e39/Placeholder.mill/1024x1024bb.png)
  differs from the lookup's `podcastsCalistoga` asset. The page's JSON-LD
  still refers to that older asset, so JSON-LD is not used to select the icon.
- Initial vector/store rescore: central RMSE **8.60 → 6.60**, whole-frame
  RMSE **18.78 → 11.38**, and mask disagreement **7.8% → 1.8%**.

The fetcher now selects the primary `app-icon` container on the official
listing and requests its 1024-pixel PNG rendition. It validates the CDN host,
format, and dimensions before atomically replacing the cache, preserving raw
source bytes. Lookup fallback is explicitly reported. Rate-limited requests
respect `Retry-After` with bounded retries. Android-only entries are excluded
by `--ios-only`.

```sh
node pipeline/fetch-appstore-artwork.mjs --ios-only --refresh --report /tmp/appstore-artwork-refresh.json
```

Full per-app URLs, lookup version/release metadata, old/new SHA-256 hashes,
and decoded pixel comparisons are in
[the provenance report](appstore-artwork-refresh-2026-10.json). Comparisons use
the original cache before any refresh, including Apple's initial test. The
central-half comparison distinguishes interior artwork changes from corner
transparency changes; it is separate from the facet scoring metric.

Original rasters and the Apple comparison images are backed up locally under
`/tmp/podlink-appstore-refresh-2026-10-16/`. Raster assets remain generated and
gitignored; they can be fetched again using the updated pipeline.

## Completed store-reference rescore

Rebuilt the static SVGs, then scored all **70** available store references
(65 iOS and five Android) with the existing central-60%-crop metric. The
16 platforms without a store raster were skipped. Generated 70 comparison
sheets, each showing vector, store artwork, and 4× absolute difference.

The store score snapshot now includes **11 newly scored entries**;
**43** of the 59 existing scores changed. Glass-master and material-off
scores are unchanged because their reference images were not refreshed.

| Platform | Previous store RMSE | Refreshed store RMSE |
| --- | ---: | ---: |
| xiaoyuzhou | 26.90 | 12.88 |
| wavlake | 2.71 | 15.55 |
| yoto | 1.28 | 13.05 |
| castro | 1.71 | 13.34 |
| youtubemusic | 4.12 | 15.52 |
| siriusxm | 3.64 | 14.62 |
| icatcher | 14.68 | 24.90 |
| snipd | 5.29 | 15.47 |
| playerfm | 2.43 | 12.50 |
| ivoox | 0.53 | 10.26 |

These differences reflect a refreshed reference, not edits to the vector
artwork. Scores remain measures of pixel difference, including material
and marketing-art differences; they are not standalone quality ratings.

Snapshot: `apps/web/lib/facet-drift.json`. Detailed audit:
`/tmp/podlink-appstore-refresh-2026-10-16/store-audit.json`.
Comparison sheets: `/tmp/facet-drift-work/sheets-store/`.
