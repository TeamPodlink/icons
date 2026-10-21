# October 2026 platform additions

Verified October 16, 2026. Includes consumer listening services with explicit podcast support. Source URLs and original download hashes are recorded in `sources.json`.

| Platform | Podcast evidence | Scope |
| --- | --- | --- |
| Sonnet | [Official source](https://play.google.com/store/apps/details?id=com.sonnet.app) | Current Android app describes podcast playback; updated September 24, 2026. |
| LiSTNR | [Official source](https://www.listnr.com) | Active podcast catalogue and Australian listener app. |
| Anghami | [Official source](https://www.anghami.com/podcasts) | Current music and podcast listener app. |
| Audiomack | [Official source](https://audiomack.com/audiomack-podcasts) | Listener platform has an official podcast catalogue; excludes the separate Creator app. |
| BBC Sounds | [Official source](https://apps.apple.com/gb/app/bbc-sounds/id1380676511) | Active podcast listener app; UK availability. |
| Claro Música | [Official source](https://www.claro.com.pe/personas/app/claro-musica/) | Official consumer service explicitly includes podcasts. |
| Hungama | [Official source](https://www.hungama.com) | Current Hungama OTT service includes a Popular Podcast catalogue; not the separate music-only app. |
| KKBOX | [Official source](https://apps.apple.com/tw/app/id300915900) | Current app explicitly offers music and podcasts. |
| Mixcloud | [Official source](https://www.mixcloud.com) | Active listener platform for radio shows, mixes and podcasts. |
| Zvuk | [Official source](https://play.google.com/store/apps/details?id=com.zvooq.openplay) | Current HiFi music and podcast listener app, formerly SberZvuk. |
| TIDAL | [Official source](https://support.tidal.com/hc/en-us/articles/360003671658-My-Video-Mix) | Official listener support still documents original podcasts; not a general RSS-directory claim. |

## Artwork

LiSTNR uses the official website SVG. The other ten flat icons are deterministic vector traces of current official store artwork, marked `flatSource: drawn`; these are not developer-supplied vectors. Badge art uses the same geometry and the repository’s standard squircle clip. Source solid colors are matched; Claro Música and KKBOX retain their vertical background gradients, and Audiomack retains its mark gradient. Hungama’s rounded store canvas is extended to the full square before the repository applies its own mask.

App Store lookups use each regional listing through `appStoreCountry` (AU, GB, MX, IN, TW as applicable).

Generated Icon Composer bundles are derived from these flat SVGs, not extracted from the apps. Dark renditions are derived previews: Claro Música’s black headphones become white, Zvuk’s mark takes its green background color, and Mixcloud’s white mark is held white for contrast. Source artwork remains the property of the respective platforms.

## Exclusions

Bullhorn’s former consumer app, Podhero’s former player, RadioPublic, and Luminary are discontinued. Megaphone and Spotify for Creators are creator tools. JOOX and DONLU do not have sufficiently clear current podcast support. Steno.fm was removed at its owner’s request after shutdown; historical measurement notes in `pipeline/README.md` are retained.

## Validation

All eleven bundles passed the flat-SVG render gate and were rendered through Icon Composer in light and dark appearances. The recipe pipeline was also attempted for each bundle. Its existing v1 reader rejects SVG layers without an `icon.json` fill override (`unsupported fill None`); no procedural recipes were adopted. The shipped previews use the successful Icon Composer renders.

The web production build and all 321 icon package tests pass. Structural validation passes for all 86 remaining platforms and bundles. The legacy icon validator still reports 16 badge viewBox errors in unchanged, pre-existing platforms; none belong to these additions.
