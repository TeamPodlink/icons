import { describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import { getIconData, platforms, resolveBadgeContent, resolveBadgeViewBox } from './index.js'
import type { IconData } from './types.js'

const icon = { viewBox: '0 0 32 32', content: '<path id="icon"/>' }

describe('badge viewBox resolution', () => {
  it.each(['8 8 24 24', '-12 6 48 24', '5 -10 12 48'])('preserves %s', (viewBox) => {
    const data = { ...icon, badge: '<path id="badge"/>', badgeViewBox: viewBox }
    expect(resolveBadgeViewBox(data)).toBe(viewBox)
    expect(resolveBadgeViewBox(data, 'light')).toBe(viewBox)
    expect(resolveBadgeViewBox(data, 'dark')).toBe(viewBox)
  })

  it('selects content and coordinates together through every fallback', () => {
    const data: IconData = {
      ...icon,
      badge: '<path id="badge"/>',
      badgeViewBox: '8 8 24 24',
      badgeDark: '<path id="dark"/>',
      badgeDarkViewBox: '-5 10 48 16',
    }
    expect(resolveBadgeContent(data, 'dark')).toBe(data.badgeDark)
    expect(resolveBadgeViewBox(data, 'dark')).toBe(data.badgeDarkViewBox)
    expect(resolveBadgeViewBox({ ...data, badgeDark: undefined }, 'dark')).toBe(data.badgeViewBox)
    expect(resolveBadgeViewBox({ ...data, badge: undefined }, 'light')).toBe(icon.viewBox)
    expect(resolveBadgeViewBox({ ...data, badgeDarkViewBox: undefined }, 'dark')).toBe(icon.viewBox)
    expect(resolveBadgeViewBox({ ...data, badgeViewBox: undefined }, 'light')).toBe(icon.viewBox)
    // Empty content is present under the existing nullish fallback contract.
    expect(resolveBadgeContent({ ...data, badgeDark: '' }, 'dark')).toBe('')
    expect(resolveBadgeViewBox({ ...data, badgeDark: '' }, 'dark')).toBe(data.badgeDarkViewBox)
  })

  it('accepts legacy IconData and one-argument callers', () => {
    const legacy: IconData = { ...icon, badge: '<path/>' }
    expect(resolveBadgeViewBox(legacy)).toBe(icon.viewBox)
    expect(resolveBadgeViewBox(legacy, 'dark')).toBe(icon.viewBox)
    expect(resolveBadgeViewBox(icon, 'light')).toBe(icon.viewBox)
    expect(resolveBadgeViewBox(icon, 'dark')).toBe(icon.viewBox)
  })

  for (const { id } of platforms) {
    it(`${id} retains coordinates from the selected source SVG`, () => {
      const data = getIconData(id)
      if (!data) throw new Error(`Missing generated icon data for ${id}`)
      for (const theme of ['light', 'dark'] as const) {
        const kinds = theme === 'dark' ? ['badge-dark', 'badge', 'icon'] : ['badge', 'icon']
        const source = kinds
          .map((kind) =>
            join(dirname(fileURLToPath(import.meta.url)), '../source-icons', id, `${kind}.svg`),
          )
          .find(existsSync)!
        const viewBox = readFileSync(source, 'utf8').match(/viewBox="([^"]+)"/)![1]
        expect(resolveBadgeViewBox(data, theme)).toBe(viewBox)
      }
    })
  }
})
