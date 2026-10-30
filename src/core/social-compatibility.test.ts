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
import released from './__fixtures__/released-0.3.0.json'
import approved from './__fixtures__/approved-social-icons.json'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex')
const shapes: IconShape[] = ['square', 'circle', 'superellipse']

// Captured from a clean build of release commit a1d16f8 before these additions.
// Keep this fixed: it also protects the ten live platforms introduced in 0.3.0.
describe('0.3.0 compatibility after social additions', () => {
  it('adds the social IDs and PeerTube while preserving exports, metadata and ordering', () => {
    expect(Object.keys(core).sort()).toEqual(released.coreExports)
    expect(Object.keys(react).sort()).toEqual(released.reactExports)
    expect(core.platforms.slice(0, 95)).toEqual(released.platforms.map((p) => p.metadata))
    expect(core.platforms.slice(95).map((p) => p.id)).toEqual([
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
    ])
  })

  it('resolves display-name and punctuation variants without changing canonical IDs', () => {
    for (const [name, id] of [
      ['Ko-fi', 'kofi'],
      ['Buy Me a Coffee', 'buymeacoffee'],
      ['Cash App', 'cashapp'],
      ['PayPal', 'paypal'],
      ['WhatsApp', 'whatsapp'],
      ['Venmo', 'venmo'],
      ['Discord', 'discord'],
      ['Reddit', 'reddit'],
    ]) {
      expect(core.resolvePlatformId(name)).toBe(id)
      expect(core.getIconData(name)).toBe(core.getIconData(id))
    }
  })

  for (const { metadata, iconDataSha256, rendersSha256, staticSha256 } of [
    ...released.platforms,
    ...approved.platforms,
  ]) {
    const id = metadata.id
    const isReleased = released.platforms.some((p) => p.metadata.id === id)
    it(`${id} keeps exact core data, React output and static files`, () => {
      // Preserve every released field; viewBox metadata is the only addition.
      const data = core.getIconData(id)!
      const legacyData = {
        viewBox: data.viewBox,
        content: data.content,
        badge: data.badge,
        badgeDark: data.badgeDark,
      }
      expect(hash(JSON.stringify(legacyData))).toBe(iconDataSha256)
      const renders = shapes.flatMap((shape) =>
        [16, 24, 32, 48, 64]
          .map((size) =>
            renderToStaticMarkup(createElement(react.PlatformIcon, { platform: id, shape, size })),
          )
          .concat(
            (['light', 'dark'] as const).map((theme) =>
              renderToStaticMarkup(
                createElement(react.PlatformBadge, {
                  platform: id,
                  shape,
                  theme,
                  // Preserve the approved artwork while allowing its requested default label.
                  ...(isReleased ? {} : { label: 'Listen on' }),
                }),
              ).replace(
                `<svg viewBox="${core.resolveBadgeViewBox(data, theme)}"`,
                `<svg viewBox="${data.viewBox}"`,
              ),
            ),
          ),
      )
      expect(hash(JSON.stringify(renders))).toBe(rendersSha256)
      expect(
        (isReleased
          ? [`icons/${id}.svg`, `badges/${id}-light.svg`, `badges/${id}-dark.svg`]
          : [`icons/${id}.svg`]
        ).map((file) => hash(readFileSync(join(root, `static/${file}`)))),
      ).toEqual(isReleased ? staticSha256 : staticSha256.slice(0, 1))
    })
  }
})
