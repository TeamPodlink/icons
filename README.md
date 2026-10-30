# @podlink/icons

Podcast platform icons and "Listen on" badges — framework-agnostic SVG strings + React components.

80+ podcast platforms. Light and dark themes. Three icon shapes. Static SVG assets included.

## Install

```sh
npm install @podlink/icons
```

## Quick start

### React components

```jsx
import { PlatformIcon, PlatformBadge } from '@podlink/icons/react'

// Square icon with superellipse (iOS-style) clip
<PlatformIcon platform="spotify" size={48} />

// "Listen on" badge
<PlatformBadge platform="applepodcasts" theme="dark" />
```

### Core (framework-agnostic)

SVG strings you can use in any environment — server-side rendering, vanilla JS, web components, etc.

```js
import { getIconData, resolveBadgeContent } from '@podlink/icons'

const data = getIconData('spotify')
// data.content  → raw SVG inner content
// data.viewBox  → "0 0 32 32"

// Get badge SVG content for a dark theme
const badgeSvg = resolveBadgeContent(data, 'dark')
```

### Static SVG files

The package includes pre-built SVG files you can reference directly:

```html
<!-- From npm (after install) -->
<img src="node_modules/@podlink/icons/static/icons/spotify.svg" width="32" height="32" />
<img src="node_modules/@podlink/icons/static/badges/spotify-dark.svg" height="40" />
```

Import via the package exports map:

```js
import iconUrl from '@podlink/icons/static/icons/spotify.svg'
import badgeUrl from '@podlink/icons/static/badges/spotify-light.svg'
```

### Next.js App Router

The core entrypoint (`@podlink/icons`) is safe to use from Server Components, route handlers, and shared server helpers because it returns framework-agnostic SVG data.

The React entrypoint (`@podlink/icons/react`) is also safe to render from Server Components. Its components are prop-only and do not use context or browser APIs.

For Podlink-specific defaults, styling, or accessibility choices, prefer local wrappers in your app:

```tsx
import { PlatformIcon } from '@podlink/icons/react'

export function PlatformAvatarIcon({ platform }: { platform: string }) {
  return <PlatformIcon platform={platform} decorative />
}
```

Server Components can render the package component directly or render your local wrapper:

```tsx
import { PlatformAvatarIcon } from './PlatformAvatarIcon'

export function PodcastPlatform({ platform }: { platform: string }) {
  return <PlatformAvatarIcon platform={platform} />
}
```

If you only need SVG strings or metadata in server code, import from `@podlink/icons`.

## React API

### `<PlatformIcon>`

Renders a platform icon as an inline SVG.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `platform` | `string` | — | Platform ID (required) |
| `shape` | `'superellipse' \| 'circle' \| 'square'` | `'superellipse'` | Clip shape |
| `size` | `number` | `32` | Width and height in pixels |
| `className` | `string` | — | CSS class |
| `style` | `CSSProperties` | — | Inline styles |
| `aria-label` | `string` | `"{Platform} icon"` | Accessible label |
| `decorative` | `boolean` | `false` | If true, hides from assistive tech |

### `<PlatformBadge>`

Renders a platform badge as an inline HTML element. Social and supporter platforms default to “Follow on” or “Support on”; PeerTube defaults to “Watch on”. Existing platforms retain their defaults.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `platform` | `string` | — | Platform ID (required) |
| `theme` | `'light' \| 'dark'` | `'light'` | Color theme |
| `label` | `string` | Platform default, otherwise `'Listen on'` | Text above the platform name; overrides the default |
| `platformName` | `string` | Platform display name | Override the platform name |
| `shape` | `'superellipse' \| 'circle' \| 'square'` | `'superellipse'` | Icon clip shape |
| `dir` | `'ltr' \| 'rtl'` | `'ltr'` | Text direction |
| `height` | `number` | `40` | Badge height in pixels |
| `className` | `string` | — | CSS class |
| `style` | `CSSProperties` | — | Inline styles |
| `aria-label` | `string` | `"{label} {Platform}"` | Accessible label |
| `decorative` | `boolean` | `false` | If true, hides from assistive tech |

## Core API

All exports are available from `@podlink/icons`.

### Platform data

```ts
import {
  platforms,
  resolvePlatformId,
  hasPlatformIcon,
  getPlatform,
  getIconData,
} from '@podlink/icons'

platforms                 // Platform[] — all platforms
resolvePlatformId(input)  // PlatformId | undefined
hasPlatformIcon(input)    // boolean
getPlatform(input)        // Platform | undefined
getIconData(input)        // IconData | undefined
```

Platform lookups accept canonical IDs and known aliases. They also normalize common slug input, so `amazon`, `Amazon Music`, and `amazon-music` all resolve to the canonical `amazonmusic` ID.

### Badge resolution

```ts
import { resolveBadgeContent, resolveBadgeViewBox } from '@podlink/icons'

// Resolves the correct SVG content for a badge variant
// Light: badge → icon fallback
// Dark:  badgeDark → badge → icon fallback
resolveBadgeContent(data, 'light')  // string
resolveBadgeContent(data, 'dark')   // string

resolveBadgeViewBox(data)          // string — light badge viewBox (default)
resolveBadgeViewBox(data, 'dark')  // string — viewBox matching dark badge content
```

### Shapes

```ts
import { shapes } from '@podlink/icons'

shapes.superellipse  // iOS-style squircle (default)
shapes.circle
shapes.square

// Each ShapeDefinition has:
//   svgPath(size: number): string   — <path d="..."> for the shape
//   clipPath(size: number): string  — <clipPath> element as string
```

### SVG utilities

```ts
import { extractSvgContent, extractViewBox, prefixIds, minifySvg } from '@podlink/icons'

extractSvgContent(svgString)       // inner content of an <svg> element
extractViewBox(svgString)          // viewBox attribute value
prefixIds(svgContent, 'myprefix')  // prefix all id/url(#...) references
minifySvg(svgString)               // minify SVG markup
```

### Types

```ts
import type { PlatformId, Platform, IconData, IconShape, ShapeDefinition } from '@podlink/icons'
```

## Shapes

Icons support three clip shapes:

- **`superellipse`** (default) — iOS-style squircle with a smooth continuous curve
- **`circle`** — circular clip
- **`square`** — no clipping, raw icon bounds

## Platforms

The package includes 80+ podcast platforms. See [`src/data/platforms.json`](src/data/platforms.json) for the full list of platform IDs and display names.

Each platform has an `active` flag — inactive platforms are deprecated but still included for backwards compatibility.

## License

MIT

### Social and supporter badges

Threads, Bluesky, Mastodon, Discord, Reddit and WhatsApp default to “Follow on”.
Ko-fi, PayPal, Buy Me a Coffee, Venmo and Cash App default to “Support on”.
These labels apply to generated static badges and React badges; React callers
can still supply `label` for custom or localized wording. All released platform
defaults and static artwork remain unchanged.

Venmo requires an icon plate of at least 20px (10px monogram). Its generated
32px icon and 40px badge with a 24px icon meet this minimum. Use `size >= 20`
for React icons and `height >= 34` for React badges; do not scale static assets
below those limits. See `NOTICE.md` for brand context and clear-space requirements.
