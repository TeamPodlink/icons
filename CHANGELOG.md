# Changelog

## 0.4.1

- Render React badge artwork using its own viewBox, fixing scale and placement for badges whose coordinates differ from the platform icon.
- Preserve badge and dark-badge viewBoxes in generated icon data. `resolveBadgeViewBox(data, theme?)` follows the content fallback chain and defaults to light; existing one-argument calls and legacy `IconData` remain supported.

## 0.4.0

- Use “Follow on” for the six new social/community badges and “Support on” for the five new supporter badges; retain React label overrides and all released outputs.
- Add Threads, Bluesky, Mastodon, Discord, Reddit, WhatsApp, Ko-fi, PayPal, Buy Me a Coffee, Venmo, and Cash App through the existing core, React, and static APIs, preserving all 95 released platform IDs and artwork.

## 0.3.0

- Add Twitch, Kick, Rumble, Facebook, Instagram, LinkedIn, TikTok, X, Substack, and Patreon through
  the existing core, React, and static APIs; `twitter` resolves to `x`.
- Fix unintended black fills in gPodder and Podurama React icons/badges by
  explicitly preserving their stroke-only paths; original colors/geometry remain.
- Preserve all 85 published 0.2.0 IDs and metadata, and exact artwork/rendering
  for the other 83 platforms. Add compatibility coverage against the actual published package
  and Podlink's current consumer ID inventory.

## 0.2.0

### Breaking

- Removed `PodlinkProvider`, `usePodlinkConfig`, `PodlinkConfig`, and `PodlinkProviderProps` from `@podlink/icons/react`.
- React icons and badges are now prop-only and can render from Next.js App Router Server Components.

### Migration

- Pass defaults directly to `PlatformIcon` and `PlatformBadge`, or create app-local wrapper components for shared defaults.
- Use `@podlink/icons` for framework-agnostic SVG data and metadata in server-only helpers.

### Changed

- Added npm package metadata: `homepage`, `repository`, and `bugs`.
