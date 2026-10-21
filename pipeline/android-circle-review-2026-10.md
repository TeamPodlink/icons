# Android Circle resource review — 2026-10-16

Inspected APK resources with apktool 3.0.3, without installing or running
any APK. Source APKs, decoded resources, and temporary comparisons remain
outside the repository under `/tmp/podlink-android-circles/`.

## Findings

| App | Round resource | Foreground/background evidence | Circle decision |
| --- | --- | --- | --- |
| AntennaPod | `android:roundIcon` and `android:icon` both reference `@mipmap/ic_launcher` | Adaptive XML references separate 432×432 PNG foreground and background; a separate monochrome resource is for themed icons | No distinct round scaling to adopt |
| Pocket Casts, phone and Wear OS | Neither application declares `roundIcon`; both use `@mipmap/ic_launcher` | Default foreground and background VectorDrawable XML are byte-identical between phone and watch APKs | No additional watch-specific scale to adopt |
| Fountain | No `roundIcon`; `@mipmap/ic_launcher` is adaptive | Two-drop vector foreground on a black vector background; 108×108 viewport, group scale 0.58 and translation (22.68,22.68) | No separate circular artwork; preserve the existing gallery framing |

Pocket Casts' foreground places its native 512-unit artwork on a 108-unit
canvas with scale 0.15820312 and translation (13.5,13.5). This is adaptive
canvas placement, **not** a 0.158 scale modifier to apply to the already
framed web icon. The phone/Wear foreground XML SHA-256 is
`0b2cc09b34b51fabfc872eaab3f35ebf6e2c4fbfef46d6404aec2d9f06bb2cfe`;
background XML is
`88433609096b9eea7fe3fb561eca55d374c6e422f7063c583f930b1c1946c1c6`.
Its other named launcher resources are user-selectable alternate brands,
not circle-specific overrides of the default icon.

Fountain's placement matches the earlier APK geometry recorded in
`pipeline/README.md` (the 2026-09-18 Fountain review). Its cached APK's
signing certificate differs from the Play certificate in that earlier
record, so this inspection is corroboration only; no new artwork was
adopted from this file.

Android does not prescribe a blanket 6% circle reduction. Its optional
`roundIcon` can identify circle-specific art, while a shared adaptive
icon is composed from layers and masked by the launcher. The safe zone,
layer canvas, and final viewport are different coordinate spaces.
See [Android's adaptive icon documentation](https://developer.android.com/develop/ui/compose/system/icon_design_adaptive).

## Google Play acquisition follow-up

On 2026-10-16, the maintainer configured their own Google Play account
locally and authorized this download pass. apkeep 1.1.0 fetched 15 APKs
(including the previously verified Sonnet download); every file passed a
full ZIP CRC check. No APK was installed or executed. Credentials remain
outside the repository and are not included in this report.

All 11 priority apps are available: Audacy, Global Player, Goodpods,
iVoox, JioSaavn, Podbean, SiriusXM, Sonnet, Spotify, TuneIn, and YouTube
Music. Fountain, Hungama, Podcast Addict, and Podkicker were also fetched.
BBC Sounds (`com.bbc.sounds`) and Zvuk (`com.zvooq.openplay`) returned no
APK. The exact reason was not established; these failures do not imply
that either app is discontinued. This pass covers the requested priority
apps and additional confirmed repository package IDs, not every possible
Android app in the directory.

APKs are in `/tmp/podlink-android-circles/play/`; decoded resources are in
`/tmp/podlink-android-circles/decoded-play/<platform>/`. The scratch
`play-inventory.json` records the acquisition result, versions, hashes,
application icon references, launcher activity overrides, and resource
paths. These paths are temporary and are not release assets.

### Adaptive and round-icon findings

| App | Application round icon | Resource finding |
| --- | --- | --- |
| Audacy | `@mipmap/ic_launcher_round` | Normal and round adaptive XML are byte-identical; white vector foreground on a color background |
| Global Player | None | Vector foreground over raster background; one shared adaptive resource |
| Goodpods | `@mipmap/ic_launcher_round` | Normal and round adaptive XML are byte-identical; both foreground and background have explicit `16.700005%` insets |
| iVoox | `@mipmap/ic_ivoox_launcher_rebranding_round` | Normal and round adaptive XML are byte-identical; shared rebranding foreground/background drawables |
| JioSaavn | `@mipmap/ic_launcher_round` | Normal and round adaptive XML are byte-identical; shared raster foreground/background resources |
| Podbean | `@mipmap/ic_launcher_round` | Normal and round adaptive XML are byte-identical; shared foreground mipmap and background color |
| SiriusXM | None | Shared foreground mipmap and background color; separate monochrome drawable |
| Sonnet | `@mipmap/ic_launcher_round` | Normal and round adaptive XML are byte-identical; blue vector foreground and background color |
| Spotify | None | Default adaptive resource has a green disc on black; an emerald-green alternative has separate layers, not a circle-only override |
| TuneIn | None | Shared foreground vector and background color; an unreferenced round XML is identical to the normal resource; TV launcher uses separate artwork |
| YouTube Music | Same as normal: `@mipmap/ic_launcher_release` | Shared color background/foreground mipmaps; separate monochrome drawable |
| Fountain | None | Shared vector foreground/background with monochrome reference to the same foreground |
| Hungama | Same as normal: `@mipmap/ic_launcher` | Default adaptive vector foreground and color background; an alternate launcher resource is also present |
| Podcast Addict | None | Foreground mipmap, background color, and a separate monochrome vector |
| Podkicker | None | Foreground mipmap and background color |

The round XML checks establish that these apps do not specify a separate
**adaptive** round scale in the inspected build. Older density-specific
round rasters may still differ, and no new measured web-icon scale is
claimed here. In particular, Goodpods' insets and Global Player's vector
placement describe Android layer coordinates, not direct percentages to
apply to our already-framed SVGs. No icon artwork was changed by this
acquisition pass.

Fresh Fountain from Google Play is version 1.5.8 / 1830 and its signer
matches the earlier Play certificate recorded in the repository. It
supersedes the unverified-source cached 1.5.10 sample as this review's
trusted acquisition reference. The cached file's different signer was
not adopted.

## APK provenance

Certificates below were read from the APK v2/v3 signing block and hashed
as DER. They identify the supplied signer; this is not a claim that the
complete APK signatures were independently verified. The two Pocket Casts
builds have matching certificates. F-Droid signs its own AntennaPod build.

### AntennaPod

- Package: `de.danoeh.antennapod`
- Version / code: `3.12.3 / 3120395`
- Source: [F-Droid via apkeep 1.1.0](https://f-droid.org/packages/de.danoeh.antennapod/)
- APK SHA-256: `6e79f28f69cef1a8b2e4f5f88c9c3cf3c3d7c51356f01394ac23b0dc5d56a00b`
- Certificate SHA-256: `179430565a4a04bfe7827483243099bd10870410800cd7c4c7b48d8d3226df55`

### Pocket Casts (phone)

- Package: `au.com.shiftyjelly.pocketcasts`
- Version / code: `8.22 / 9463`
- Source: [Developer GitHub release](https://github.com/Automattic/pocket-casts-android/releases/tag/8.22)
- APK SHA-256: `900238bf804b220c816e6be2a381d9bb4bd82a7388fe700fc3c95e307ef9fd08`
- Certificate SHA-256: `ce0825f4ca785676d90d3af60f54fe43b8427afe9e1bb677add758dac1291820`

### Pocket Casts (Wear OS)

- Package: `au.com.shiftyjelly.pocketcasts`
- Version / code: `8.22w / 109463`
- Source: [Developer GitHub release](https://github.com/Automattic/pocket-casts-android/releases/tag/8.22)
- APK SHA-256: `451b0a700d9c0f6ab050ebb80ed10c32a41c37fbae2c7780462dd36bd05aad4a`
- Certificate SHA-256: `ce0825f4ca785676d90d3af60f54fe43b8427afe9e1bb677add758dac1291820`

### Fountain

- Package: `fm.fountain.apps`
- Version / code: `1.5.10 / 1844`
- Source: Existing local download; original download URL not retained
- APK SHA-256: `69051457cc3b85b1b333e7bf052bc02838ba8340fbee543d6247778388d3db8a`
- Certificate SHA-256: `acce9db13ec2ccdef4f5d19277901ec2bc994e0516e751e1eeb93e378862a02e`


## Authenticated Google Play APK provenance

All sources below are Google Play, downloaded with apkeep 1.1.0. Version
values came from apktool 3.0.3; certificate fingerprints came from parsed
v2/v3 signing-block DER certificates (structural extraction, not full
cryptographic APK signature verification). YouTube Music contains two
distinct certificates across its signing schemes; both are retained.

### audacy

- Package: `com.radiocom`
- Version / code: `2026.10.01 / 26094693`
- Source: [Google Play listing](https://play.google.com/store/apps/details?id=com.radiocom)
- APK SHA-256: `a89c9aea0c68128659ef7afc4505ad5ed9f2f909f8921e60aa5d4c9b098d713e`
- Certificate SHA-256: `478411047b41d14df9b3d9c457ca0a2b09dd10ab1208dffa8fd164dc97c5a8f7`

### fountain

- Package: `fm.fountain.apps`
- Version / code: `1.5.8 / 1830`
- Source: [Google Play listing](https://play.google.com/store/apps/details?id=fm.fountain.apps)
- APK SHA-256: `c180ae1763e6f0e86905be65bb1ab089b0992301df70763ee54d309ff527ca86`
- Certificate SHA-256: `ff9bda989a899f4caf997ec2484db0fbfe6a7ab1202bbdfbb72ee753c468aa0e`

### globalplayer

- Package: `com.global.player`
- Version / code: `130.0.3 / 1607207`
- Source: [Google Play listing](https://play.google.com/store/apps/details?id=com.global.player)
- APK SHA-256: `6cc3a479db9c481f99779ec608eb081319d348b1330f7e92748ab62843ffe706`
- Certificate SHA-256: `71c47a3fcb639011089a13e85470fdb23b1b4fd7d3ee91166d2f467fd044370b`

### goodpods

- Package: `com.goodsearch.goodpods`
- Version / code: `5.12.0 / 61007`
- Source: [Google Play listing](https://play.google.com/store/apps/details?id=com.goodsearch.goodpods)
- APK SHA-256: `d0886654c2f77a6e109e413365b3a7498a946f21fe2fd56b397ca0814dfd1995`
- Certificate SHA-256: `85017c851bee38bad81b69da580f576922d1ec1c1929303f6c8f7c1126a288f2`

### hungama

- Package: `com.hungama.myplay.activity`
- Version / code: `8.7.8 / 778`
- Source: [Google Play listing](https://play.google.com/store/apps/details?id=com.hungama.myplay.activity)
- APK SHA-256: `d31e640d67b89b58a5260aca6bbf756da2f518a36224e87455467485bc2db604`
- Certificate SHA-256: `ca821d62f204d9b3156f66cfa7d1ad8bfc1a9ec66600e9cd62677700af69467d`

### ivoox

- Package: `com.ivoox.app`
- Version / code: `2.402 / 617`
- Source: [Google Play listing](https://play.google.com/store/apps/details?id=com.ivoox.app)
- APK SHA-256: `b818cdc887d14cb1f179ecfca3ef0cce0088e880ed3d6fd7e4e712bc574430da`
- Certificate SHA-256: `abf5cdd2d0f7377cb763ddee219d3cb282492fec262e43bc50b638b2d5e7555e`

### jiosaavn

- Package: `com.jio.media.jiobeats`
- Version / code: `10.10.1 / 568`
- Source: [Google Play listing](https://play.google.com/store/apps/details?id=com.jio.media.jiobeats)
- APK SHA-256: `1efdb349494b79207f03284f2e676ffa98a167bfa95bd925294c51059920edb2`
- Certificate SHA-256: `ab2ce23e33a12c9a1edb757f1b499fe2234ea5f9d8db7ae0c35d72a04d33417a`

### podbean

- Package: `com.podbean.app.podcast`
- Version / code: `9.9.7 / 8409`
- Source: [Google Play listing](https://play.google.com/store/apps/details?id=com.podbean.app.podcast)
- APK SHA-256: `ac47e020dfe1a4cdefc00acbb470f9625bf4b0413ac00df656ff810bb84217ae`
- Certificate SHA-256: `595a7b09a6a10a8bb18cc15e0423d52bf041253fad0a388562dccfdab09524b2`

### podcastaddict

- Package: `com.bambuna.podcastaddict`
- Version / code: `2026.12.1 / 21806`
- Source: [Google Play listing](https://play.google.com/store/apps/details?id=com.bambuna.podcastaddict)
- APK SHA-256: `79248063c8f7d728351e03d7066f5493760ddd84d08751e092b2aa3790ed5fd4`
- Certificate SHA-256: `1cf0c0697b5d56a9b45c302dd038ff1d3ef53aefcf17c36e41f816afe66acc9c`

### podkicker

- Package: `ait.podka`
- Version / code: `4.7.0(385) / 385`
- Source: [Google Play listing](https://play.google.com/store/apps/details?id=ait.podka)
- APK SHA-256: `419e6952135297f594d0a1def8413b6634867d598d46d1ba0e273ad0fc7e5118`
- Certificate SHA-256: `5b5f12a6df90251f61e34315243f293f9f862f66175374009729695214f8e356`

### siriusxm

- Package: `com.sirius`
- Version / code: `2609.5.0 / 1726092200`
- Source: [Google Play listing](https://play.google.com/store/apps/details?id=com.sirius)
- APK SHA-256: `8f4645079d60e90100d75644ece3e964052bcda5806e253f64f18a333e6cbb50`
- Certificate SHA-256: `efdcfc8096973f22085bc1fcabd2cafd74536238fee873f2fde2a8a8369c8360`

### sonnet

- Package: `com.sonnet.app`
- Version / code: `2.3.22 / 2322`
- Source: [Google Play listing](https://play.google.com/store/apps/details?id=com.sonnet.app)
- APK SHA-256: `ab7cd85387f37a809c534ce0dd9566a2d25b81f12cfc21907e548e879093555e`
- Certificate SHA-256: `530b1dafefe4e2cb260064ae0141ed2ee8c6e50239ed562a7bbb3fbc5b4ee7ca`

### spotify

- Package: `com.spotify.music`
- Version / code: `9.1.92.3058 / 147346334`
- Source: [Google Play listing](https://play.google.com/store/apps/details?id=com.spotify.music)
- APK SHA-256: `c26e20a8ce9db36fd0b6021542c75abcaf4e923557b8a21058b502e295d62928`
- Certificate SHA-256: `6505b181933344f93893d586e399b94616183f04349cb572a9e81a3335e28ffd`

### tunein

- Package: `tunein.player`
- Version / code: `42.6.1 / 291637`
- Source: [Google Play listing](https://play.google.com/store/apps/details?id=tunein.player)
- APK SHA-256: `9ee74fbc16627d7d8ee9c4d677913269e2821f68227673081d4426f191ad1b6c`
- Certificate SHA-256: `f53af9f24e31e4870d440945713517271e4c8bb295f30cef7043c69535575c94`

### youtubemusic

- Package: `com.google.android.apps.youtube.music`
- Version / code: `9.41.52 / 94152240`
- Source: [Google Play listing](https://play.google.com/store/apps/details?id=com.google.android.apps.youtube.music)
- APK SHA-256: `41addc8f80b2d9b55e3e7ab921ed810fb2db514c6053469032256a7a92590d8f`
- Certificate SHA-256: `a2a1ad7ba7f41dfca4514e2afeb90691719af6d0fdbed4b09bbf0ed897701ceb`
- Certificate SHA-256: `6a2f65ec694a6a632acdcb5080912a565f903d4b8d83f0eb8e44fbdf2660d8e1`

