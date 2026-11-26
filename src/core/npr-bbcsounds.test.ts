import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import * as core from './index.js'
import * as react from '../react/index.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const source = (id: string) =>
  new DOMParser().parseFromString(
    readFileSync(join(root, `src/source-icons/${id}/icon.svg`), 'utf8'),
    'image/svg+xml',
  )

describe('NPR and BBC Sounds', () => {
  it('keeps the official NPR logo paths and colors on a white plate', () => {
    const document = source('npr')
    expect(document.querySelector('image, filter, parsererror')).toBeNull()
    expect(document.querySelector('svg > rect')?.getAttribute('fill')).toBe('#fff')
    const paths = [...document.querySelectorAll('g > path')]
    expect(paths.map((path) => path.getAttribute('fill'))).toEqual([
      '#d62021',
      '#237bbd',
      '#fff',
      '#fff',
      null,
      '#fff',
    ])
    // Computed from the d attributes of npr-logo-2025.svg (see docs/npr-bbcsounds-icons.md).
    expect(hash(paths.map((path) => `d="${path.getAttribute('d')}"`).join('\n'))).toBe(
      '1e90b8d6aa3dfa05572097121d07831d0bfb0a66a79541facc1c51a4e66355d1',
    )
  })

  it('keeps the official BBC blocks and SOUNDS wordmark paths on black', () => {
    const document = source('bbcsounds')
    expect(document.querySelector('image, filter, parsererror')).toBeNull()
    expect(document.querySelector('svg > rect')?.getAttribute('fill')).toBe('#000')
    const [blocks, wordmark] = [...document.querySelectorAll('svg > path')]
    expect(blocks.getAttribute('fill')).toBe('#fff')
    expect(blocks.getAttribute('fill-rule')).toBe('evenodd')
    expect(wordmark.getAttribute('fill')).toBe('#FA6400')
    // Computed from the inline SVGs served on https://www.bbc.co.uk/sounds.
    expect(hash(blocks.getAttribute('d')!)).toBe(
      '64a4782a761489dcab2678d276caeba422b1ad58a030e409cefecfd82c5e7654',
    )
    expect(hash(wordmark.getAttribute('d')!)).toBe(
      '8c9f3eb98dfe2179aee5c93a9f65c400aaf5565d74da0f37aa038a1f5f5536a3',
    )
  })

  for (const [name, id] of [
    ['NPR', 'npr'],
    ['BBC Sounds', 'bbcsounds'],
    ['bbc-sounds', 'bbcsounds'],
  ] as const) {
    it(`resolves ${JSON.stringify(name)} to ${id}`, () => {
      expect(core.resolvePlatformId(name)).toBe(id)
      expect(core.getIconData(name)).toBe(core.getIconData(id))
    })
  }

  for (const id of ['npr', 'bbcsounds'] as const) {
    it(`${id} uses the default Listen on label in React and both static badges`, () => {
      const platform = core.getPlatform(id)!
      expect(platform.badgeLabel).toBeUndefined()
      const markup = renderToStaticMarkup(createElement(react.PlatformBadge, { platform: id }))
      const badge = new DOMParser().parseFromString(markup, 'text/html').body.firstElementChild!
      expect(badge.getAttribute('aria-label')).toBe(`Listen on ${platform.name}`)
      for (const theme of ['light', 'dark']) {
        expect(readFileSync(join(root, `static/badges/${id}-${theme}.svg`), 'utf8')).toContain(
          '<svg',
        )
      }
    })
  }
})
