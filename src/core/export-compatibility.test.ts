import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import * as core from './index.js'
import * as react from '../react/index.js'
import type { IconShape } from './types.js'
import type { PlatformId } from '../generated/platform-ids.js'
import released from './__fixtures__/published-0.2.0.json'
import corrections from './__fixtures__/stroke-fill-corrections.json'

// Captured from the actual npm 0.2.0 tarball, not regenerated from these sources.
// Its 85 icon IDs also match Podlink's installed package and client-side helper.
// Run `pnpm build` before this suite so it checks the distributable static files.
const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex')
const shapes: IconShape[] = ['square', 'circle', 'superellipse']
const sizes = [16, 24, 32, 48, 64]
const additions = [
  'twitch',
  'kick',
  'rumble',
  'facebook',
  'instagram',
  'linkedin',
  'tiktok',
  'x',
  'substack',
  'patreon',
  'threads',
  'bluesky',
  'mastodon',
  'discord',
  'reddit',
  'whatsapp',
  'kofi',
  'paypal',
  'buymeacoffee',
  'venmo',
  'cashapp',
  'peertube',
] as const satisfies readonly PlatformId[]

describe('published 0.2.0 / current Podlink export compatibility', () => {
  it('retains every public export and adds only the requested live and social IDs', () => {
    expect(Object.keys(core).sort()).toEqual(released.coreExports)
    expect(Object.keys(react).sort()).toEqual(released.reactExports)
    const available = core.platforms.filter((p) => core.hasPlatformIcon(p.id)).map((p) => p.id)
    expect(available.sort()).toEqual([...released.consumerIds, ...additions].sort())
    expect(core.platforms.slice(0, released.platformOrder.length).map((p) => p.id)).toEqual(
      released.platformOrder,
    )
  })

  it('retains the released shape functions at every sampled size', () => {
    for (const shape of shapes) {
      for (const size of sizes) {
        const expected = released.shapes[shape][size as 16 | 24 | 32 | 48 | 64]
        expect(core.shapes[shape].svgPath(size)).toBe(expected.svgPath)
        expect(core.shapes[shape].clipPath(size)).toBe(expected.clipPath)
      }
    }
  })

  for (const original of released.platforms) {
    const id = original.id
    // Only these two explicitly reviewed stroke-fill corrections may differ.
    const expected = id === 'gpodder' || id === 'podurama' ? corrections[id] : original
    it(`${id} retains lookup, metadata, aliases and approved artwork`, () => {
      expect(core.hasPlatformIcon(id)).toBe(true)
      expect(core.resolvePlatformId(id)).toBe(id)
      expect(hash(JSON.stringify(core.getPlatform(id)))).toBe(original.metadataSha256)
      // Only additive viewBox metadata is excluded from the historical data hash.
      const data = core.getIconData(id)!
      const legacyData = {
        viewBox: data.viewBox,
        content: data.content,
        badge: data.badge,
        badgeDark: data.badgeDark,
      }
      expect(hash(JSON.stringify(legacyData))).toBe(expected.iconDataSha256)
      for (const alias of original.aliases) {
        expect(core.resolvePlatformId(alias)).toBe(id)
        expect(core.getIconData(alias)).toBe(core.getIconData(id))
      }
    })

    it(`${id} matches approved icon and badge output for every shape`, () => {
      const icons = shapes.flatMap((shape) =>
        sizes.map((size) =>
          renderToStaticMarkup(createElement(react.PlatformIcon, { platform: id, shape, size })),
        ),
      )
      const badges = shapes.flatMap((shape) =>
        (['light', 'dark'] as const).flatMap((theme) =>
          [40, 48].map((height) =>
            renderToStaticMarkup(
              createElement(react.PlatformBadge, { platform: id, shape, theme, height }),
              // Normalize only the corrected artwork viewport for the historical hash.
              // badge-viewbox.test.ts independently checks the actual source coordinates.
            ).replace(
              `<svg viewBox="${core.resolveBadgeViewBox(core.getIconData(id)!, theme)}"`,
              `<svg viewBox="${core.getIconData(id)!.viewBox}"`,
            ),
          ),
        ),
      )
      expect(hash(JSON.stringify(icons))).toBe(expected.iconRenderSha256)
      expect(hash(JSON.stringify(badges))).toBe(expected.badgeRenderSha256)
    })

    it(`${id} matches approved static icons and badges`, () => {
      expect(hash(readFileSync(join(root, `static/icons/${id}.svg`)))).toBe(
        expected.staticIconSha256,
      )
      expect(hash(readFileSync(join(root, `static/badges/${id}-light.svg`)))).toBe(
        expected.lightBadgeSha256,
      )
      expect(hash(readFileSync(join(root, `static/badges/${id}-dark.svg`)))).toBe(
        expected.darkBadgeSha256,
      )
    })
  }
})

describe('additive live and social platform coverage', () => {
  for (const id of additions) {
    it(`${id} is available through lookup, all React shapes and static exports`, () => {
      expect(core.hasPlatformIcon(id)).toBe(true)
      expect(core.getIconData(id)?.viewBox).toBe('0 0 32 32')
      expect(core.getIconData(id)!.content.length).toBeGreaterThan(100)
      for (const shape of shapes) {
        const markup = renderToStaticMarkup(
          createElement(react.PlatformIcon, { platform: id, shape, size: 24 }),
        )
        expect(markup).toContain(`${core.getPlatform(id)!.name} icon`)
        if (shape !== 'square') expect(markup).toContain(core.shapes[shape].svgPath(24))
      }
      expect(readFileSync(join(root, `static/icons/${id}.svg`), 'utf8')).toContain('<svg')
      for (const theme of ['light', 'dark']) {
        expect(readFileSync(join(root, `static/badges/${id}-${theme}.svg`), 'utf8')).toContain(
          '<svg',
        )
      }
    })
  }

  it('retains PeerTube attribution through optimization, React and static generation', () => {
    const outputs = [
      core.getIconData('peertube')!.content,
      renderToStaticMarkup(createElement(react.PlatformIcon, { platform: 'peertube' })),
      ...(['light', 'dark'] as const).map((theme) =>
        renderToStaticMarkup(createElement(react.PlatformBadge, { platform: 'peertube', theme })),
      ),
      ...['icons/peertube.svg', 'badges/peertube-light.svg', 'badges/peertube-dark.svg'].map(
        (file) => readFileSync(join(root, `static/${file}`), 'utf8'),
      ),
    ]
    for (const output of outputs) {
      expect(output).toContain('PeerTube logo by Framasoft, CC-BY-SA 4.0')
      expect(output).toContain('https://creativecommons.org/licenses/by-sa/4.0/')
      expect(output).toContain('https://joinpeertube.org/press-kit.zip')
    }
  })

  it('resolves Twitter as the new X alias', () => {
    expect(core.resolvePlatformId('Twitter')).toBe('x')
    expect(core.getIconData('twitter')).toBe(core.getIconData('x'))
  })
})

// These counts describe the authored stroke-only artwork; filled brand paths
// retain their original colors. Pinning complete output above also protects geometry.
describe('explicit stroke-only fills', () => {
  for (const [id, count] of [
    ['gpodder', 6],
    ['podurama', 2],
  ] as const) {
    it(`${id} preserves transparent stroke interiors in icons and badges`, () => {
      for (const kind of ['icon', 'badge'] as const) {
        const source = readFileSync(join(root, `src/source-icons/${id}/${kind}.svg`), 'utf8')
        // Normalize only the moved fill="none" declarations and whitespace.
        expect(hash(source.replaceAll(' fill="none"', '').replace(/\s/g, ''))).toBe(
          corrections[id].sourceGeometrySha256[kind],
        )
      }
      for (const content of [core.getIconData(id)!.content, core.getIconData(id)!.badge!]) {
        const paths = content.match(/<path\b[^>]*>/g) ?? []
        expect(paths.filter((path) => path.includes('fill="none"'))).toHaveLength(count)
        expect(
          paths.filter((path) => path.includes('stroke=') && !path.includes('fill=')),
        ).toHaveLength(0)
      }
    })
  }
})
