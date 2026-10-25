# Platform artwork

The code is MIT-licensed; see LICENSE. Platform names, marks, and artwork remain
the property of their respective owners. They are reproduced for identification;
the code license does not grant trademark rights or ownership of platform artwork.

The new Twitch, Rumble, Facebook, Instagram, LinkedIn, TikTok, and X artwork is
from `TeamPodlink/podlink-v3/public/images/platforms/<id>.svg` at commit
`bd447f04ee80d8c6542bd2534488362b49ce4882`. Paths and colors are unchanged;
Rumble adds a white background plate. The immediate source directory does not
include the original acquisition/license records, so no new upstream license is
asserted here.

Kick retains the first K glyph of the official wordmark, uniformly scaled and
centered on a black plate. The source, https://static.kick.com/kick-logo.svg,
is linked by https://about.kick.com/brand and was retrieved 2026-10-24. Its green
and black treatment matches the official site's favicon.

Substack uses the unmodified orange logo paths embedded on its official brand
page, https://substack.com/brand. Patreon uses the unmodified symbol path
embedded on https://www.patreon.com/brand, resolving its inherited color to the
official black treatment. Both were retrieved 2026-10-24, uniformly scaled and
centered with whitespace on a white plate. Their marks are not redrawn, distorted,
or cropped. The existing package applies its outer shape only to the plate.

Substack's guidelines permit accurate references where allowed by law and do
not themselves grant a trademark license. Patreon's guidelines permit digital
identification of a creator's Patreon presence and prohibit sublicensing its
marks. These marks are not offered under the code's MIT license; consumers must
follow each brand's guidelines. No separate permission from either owner has
been obtained or claimed.

See `docs/live-platform-compatibility.md` in the repository for provenance,
compatibility evidence, and the local-only candidate's verification procedure.

## Threads, Bluesky and Mastodon

These three marks are reproduced to identify their respective services. They
are not licensed under this package's MIT code license. No affiliation,
endorsement, additional permission, or sublicense is claimed.

- **Threads**: the white symbol from Meta's official Threads Brand Resource
  Center logo pack (May 2026 artwork), retrieved 2026-10-25. Paths are unchanged;
  the mark is uniformly scaled and centered on black, with at least one-quarter
  of its width in clear space. Follow
  https://www.meta.com/brand/resources/threads/; its listed broadcast, radio,
  outdoor advertising and large-print uses require separate permission.
- **Bluesky**: the official white butterfly from
  https://bsky.social/about/support/icons, retrieved 2026-10-25. The original
  vector is uniformly scaled on the current approved Blue500 (#0560FF) plate.
  © 2026 Bluesky Social, PBC. All rights reserved. The butterfly is expressly
  excluded from the source repository's MIT license by its ASSETS.md.
  Follow https://bsky.social/about/support/branding and
  https://bsky.social/about/support/trademarks. Social icon use should link to a
  Bluesky profile (or accompany its handle). Other uses must satisfy the policy
  or obtain permission. @podlink/icons is not affiliated with, endorsed by, or
  officially connected to Bluesky Social PBC.
- **Mastodon**: the symbol geometry from
  https://joinmastodon.org/logos/logo-purple.svg, retrieved 2026-10-25. Paths and placement are unchanged; the glyph is
  white on the official #6364FF accent plate, with its interior in that same
  accent color. The Brand Toolkit recommends its white treatment on a brand
  color background; the official logo-white.svg was checked as a reference.
  Mastodon names and marks belong to Mastodon GmbH. Follow
  https://joinmastodon.org/branding and https://joinmastodon.org/trademark;
  identify the service accurately and do not imply endorsement.

The small icons do not enforce surrounding page layout. Consumers must provide
context, accessible names, and the clear space required by each brand (including
Mastodon's published 36px guidance and Bluesky's external clear-space guidance).
See docs/social-platform-icons.md for source hashes and placement measurements.

## Discord, Reddit, WhatsApp and supporter services

The following official vectors were retrieved 2026-10-25 and uniformly scaled
without redrawing. Platform marks retain their owners' rights and are excluded
from this package's MIT code license. These assets identify destinations; they
are not payment buttons, proof of integration, sponsorship or endorsement.

- **Discord**: `Discord-Symbol-White.svg` from the white-symbol download linked
  by https://discord.com/branding, on the official #5865F2 background. Follow
  its logo, context, clear-space and legal brand rules; the standalone symbol
  requires established Discord context.
- **Reddit**: `Reddit_Icon_FullColor_Bleed.svg` from the official Brand System's
  Social / Share icons section, linked from https://redditinc.com/brand.
  All paths, gradients and colors are preserved. Reddit recommends this
  full-color asset for social sharing. Follow its brand guidelines and
  https://redditinc.com/policies/trademark-use-policy. Its brand page directs
  commercial licensing inquiries to Reddit; no such permission is claimed.
- **WhatsApp**: `Digital_Glyph_White_RGB_2026.svg` from Meta's official logo pack,
  with the #25D366 color supplied by its green variant. Follow
  https://www.meta.com/brand/resources/whatsapp/whatsapp-brand/; no modification
  to glyph design or color, misleading endorsement, or merchandise use is
  authorized. Listed film, television and other restricted uses need permission.
- **Ko-fi**: `kofi_symbol.svg` from the creator kit linked by
  https://more.ko-fi.com/brand-assets. The cup and heart colors are unchanged,
  on a white plate. Ko-fi permits its assets to promote a creator's Ko-fi page,
  subject to its content guidelines; avoid stretching or distorting the mark.
- **PayPal**: the current monogram SVG linked by https://www.paypal.com/us/home,
  https://www.paypalobjects.com/marketing/web/logos/paypal-mark-color_new.svg.
  All three original blues and geometry are retained on white. PayPal owns its
  marks. No general redistribution license or authorization to present an
  operational payment integration is inferred from its public availability.
- **Buy Me a Coffee**: `SVG Files/bmc-logo.svg` from the brand kit linked by
  https://buymeacoffee.com/brand. Exact supplied colors and geometry, centered
  on the supplied #FFDD00 yellow. Its brand page provides assets to promote a
  creator's page; no broader trademark license is asserted.
- **Venmo**: `Venmo_Monogram.ai` and the logo guidelines from the official
  PayPal newsroom kit. Converted directly from its PDF-compatible vector to
  SVG with Poppler, not traced. White monogram on the specified #008CFF blue.
  The guide requires symbol width of at least 10px and external clear space
  of half its width: use this plated icon at 20px or larger in production.
  Marketing/merchant uses must follow Venmo's applicable approval rules;
  this package does not provide payment acceptance or permission for marketing.
- **Cash App**: `SVG (RGB)/RGB_CashApp_Symbol.svg` from the official press kit
  linked by https://cash.app/press/assets. White symbol and original #00E013
  accent; exact vector paths retained. Follow Cash App's brand terms and
  applicable merchant guidelines for payment integrations. This is a service
  identifier, not a Cash App Pay integration or an authorization mark.

No additional brand-owner permission has been requested or obtained. Consumers
must follow current owner guidelines and obtain approval where their use
requires it. See docs/social-platform-icons.md for precise source provenance.

### PayPal and Ko-fi colored-background treatments

Ko-fi's unchanged supplied cup uses #72A5F2 from its official
[brand palette](https://more.ko-fi.com/brand-assets) and blue supporter badge.
PayPal's unchanged official vector monogram uses the colors observed in PayPal
Mobile's [current Android app listing](https://play.google.com/store/apps/details?id=com.paypal.android.p2pmobile&hl=en_US&gl=US)
on 2026-10-25: #0E319F plate, #B9C6EA rear P, #FFFFFF front P and #EAEEF9 overlap.
The US and UK listings supplied the same image. Its pixels were inspected only
as a color reference; no raster logo is embedded or redistributed in the icons.
Trademark rights remain with the owners. These are destination-link assets,
not official login or payment buttons.
