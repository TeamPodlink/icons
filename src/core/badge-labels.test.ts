import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import opentype from 'opentype.js'
import { getPlatform } from './platforms.js'
import { PlatformBadge } from '../react/PlatformBadge.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const font = opentype.loadSync(
  join(root, 'node_modules/@fontsource/inter/files/inter-latin-400-normal.woff'),
)
const labels = [
  ['Watch on', ['peertube']],
  ['Follow on', ['threads', 'bluesky', 'mastodon', 'discord', 'reddit', 'whatsapp']],
  ['Support on', ['kofi', 'paypal', 'buymeacoffee', 'venmo', 'cashapp']],
] as const

describe('new platform badge labels', () => {
  for (const [id, fills, geometryHash] of [
    [
      'kofi',
      ['#72A5F2', 'white', 'white', 'white', '#202020', 'white', '#202020', '#FF5A16'],
      'de584eefeff05642b77408155513647fe3e6f457144c630abdb5789a15b36b83',
    ],
    [
      'paypal',
      ['#0E319F', '#B9C6EA', '#FFFFFF', '#EAEEF9', '#fff'],
      '407ad53d801799ad7a9390ad3b2c3826e35fdc148ea8b5d35c52f313a0eb9a4d',
    ],
  ] as const) {
    it(`${id} keeps its geometry and uses the verified brand-reference colors`, () => {
      const source = readFileSync(join(root, `src/source-icons/${id}/icon.svg`), 'utf8')
      const document = new DOMParser().parseFromString(source, 'image/svg+xml')
      expect(
        [...document.querySelectorAll('path')].map((path) => path.getAttribute('fill')),
      ).toEqual(fills)
      // Captured before the color revision; protects all paths and transforms.
      const geometry = source.match(/\b(?:d|transform)="[^"]*"/g)!.join('\n')
      expect(createHash('sha256').update(geometry).digest('hex')).toBe(geometryHash)
    })
  }

  for (const [label, ids] of labels) {
    for (const id of ids) {
      it(`${id} uses ${label} in metadata, React and both generated static badges`, () => {
        expect(getPlatform(id)?.badgeLabel).toBe(label)
        const markup = renderToStaticMarkup(createElement(PlatformBadge, { platform: id }))
        const badge = new DOMParser().parseFromString(markup, 'text/html').body.firstElementChild!
        expect(badge.textContent).toBe(`${label}${getPlatform(id)!.name}`)
        expect(badge.getAttribute('aria-label')).toBe(`${label} ${getPlatform(id)!.name}`)

        // Check the actual outlined words, not a metadata echo or a new snapshot.
        // The 8px label line is centered in the 40px badge's two-line text block.
        const baseline = 12 + ((font.ascender + font.descender) * 8.5) / font.unitsPerEm / 2
        const expectedPath = font.getPath(label, 38, baseline, 8.5).toPathData(2)
        for (const theme of ['light', 'dark']) {
          const svg = readFileSync(join(root, `static/badges/${id}-${theme}.svg`), 'utf8')
          const document = new DOMParser().parseFromString(svg, 'image/svg+xml')
          const textPaths = [...document.documentElement.children].filter(
            (child) => child.tagName === 'path',
          )
          expect(textPaths).toHaveLength(2)
          expect(textPaths[0].getAttribute('d')).toBe(expectedPath)
        }
      })

      it(`${id} still accepts custom and empty React labels`, () => {
        for (const label of ['Custom action', '']) {
          const markup = renderToStaticMarkup(createElement(PlatformBadge, { platform: id, label }))
          const badge = new DOMParser().parseFromString(markup, 'text/html').body.firstElementChild!
          expect(badge.textContent).toBe(`${label}${getPlatform(id)!.name}`)
        }
      })
    }
  }

  it('keeps Venmo badge icons above the documented 20px plate minimum', () => {
    for (const height of [34, 40]) {
      const markup = renderToStaticMarkup(
        createElement(PlatformBadge, { platform: 'venmo', height }),
      )
      const svg = new DOMParser().parseFromString(markup, 'text/html').querySelector('svg')!
      expect(Number(svg.getAttribute('width'))).toBeGreaterThanOrEqual(20)
    }
    for (const theme of ['light', 'dark']) {
      const markup = readFileSync(join(root, `static/badges/venmo-${theme}.svg`), 'utf8')
      const svg = new DOMParser().parseFromString(markup, 'image/svg+xml').querySelector('svg svg')!
      expect(Number(svg.getAttribute('width'))).toBe(24)
    }
  })
})
