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

Renders a "Listen on {Platform}" badge as an inline HTML element.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `platform` | `string` | — | Platform ID (required) |
| `theme` | `'light' \| 'dark'` | `'light'` | Color theme |
| `label` | `string` | `'Listen on'` | Text above the platform name |
| `platformName` | `string` | Platform display name | Override the platform name |
| `shape` | `'superellipse' \| 'circle' \| 'square'` | `'superellipse'` | Icon clip shape |
| `dir` | `'ltr' \| 'rtl'` | `'ltr'` | Text direction |
| `height` | `number` | `40` | Badge height in pixels |
| `className` | `string` | — | CSS class |
| `style` | `CSSProperties` | — | Inline styles |
| `aria-label` | `string` | `"{label} {Platform}"` | Accessible label |
| `decorative` | `boolean` | `false` | If true, hides from assistive tech |

### `<PodlinkProvider>`

Context provider for shared defaults. Nested components inherit these values unless overridden.

```jsx
import { PodlinkProvider, PlatformIcon, PlatformBadge } from '@podlink/icons/react'

<PodlinkProvider theme="dark" shape="circle" label="Listen on">
  <PlatformIcon platform="spotify" />
  <PlatformBadge platform="applepodcasts" />
</PodlinkProvider>
```

| Prop | Type | Description |
|------|------|-------------|
| `theme` | `'light' \| 'dark'` | Default theme for badges |
| `shape` | `'superellipse' \| 'circle' \| 'square'` | Default icon shape |
| `label` | `string` | Default badge label text |
| `dir` | `'ltr' \| 'rtl'` | Default text direction |
| `children` | `ReactNode` | — |

### `usePodlinkConfig()`

Hook that returns the current `PodlinkConfig` from the nearest `<PodlinkProvider>`.

## Core API

All exports are available from `@podlink/icons`.

### Platform data

```ts
import { platforms, getPlatform, getIconData } from '@podlink/icons'

platforms        // Platform[] — all platforms
getPlatform(id)  // Platform | undefined
getIconData(id)  // IconData | undefined
```

### Badge resolution

```ts
import { resolveBadgeContent, resolveBadgeViewBox } from '@podlink/icons'

// Resolves the correct SVG content for a badge variant
// Light: badge → icon fallback
// Dark:  badgeDark → badge → icon fallback
resolveBadgeContent(data, 'light')  // string
resolveBadgeContent(data, 'dark')   // string

resolveBadgeViewBox(data)  // string — viewBox for the badge
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
import type { Platform, IconData, IconShape, ShapeDefinition } from '@podlink/icons'
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
