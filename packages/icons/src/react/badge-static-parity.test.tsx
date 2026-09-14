import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { readFileSync, readdirSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { PlatformBadge } from './PlatformBadge.js'

/**
 * PlatformBadge must place badge artwork exactly the way the static badge
 * generator does. static/badges/<id>-<theme>.svg is the ground truth: it is
 * what scripts/build-static.ts emits, what the website serves, and what the
 * npm package ships.
 *
 * The component once nested badge content under the ICON's viewBox, which
 * rendered the 41 tightly-cropped badges at 75-88% scale and offset, and it
 * clipped every badge to a squircle instead of leaving self-clipped plates
 * and bare marks alone. Both are invisible in markup unless you compare
 * against the generator, so that is what these tests do.
 *
 * `pnpm test` runs codegen + build:static first (see the pretest script), and
 * CI builds the package before testing, so the static badges are present.
 */

const PKG = join(dirname(fileURLToPath(import.meta.url)), '../..')
const BADGES_DIR = join(PKG, 'static/badges')
const PLATFORMS_DIR = join(PKG, '../../platforms')

interface StaticBadge {
  /** viewBox on the nested <svg> that holds the artwork. */
  iconViewBox: string
  /**
   * Whether the generator wrapped the icon block in its own squircle mask,
   * which it only does when falling back to icon.svg. Matched by id, because
   * some artwork (deezer, podcastguru) contains <mask> elements of its own.
   */
  masked: boolean
}

function readStaticBadge(id: string, theme: 'light' | 'dark'): StaticBadge {
  const svg = readFileSync(join(BADGES_DIR, `${id}-${theme}.svg`), 'utf-8')
  // The icon block is the nested <svg> placed at the 24x24 box at (8,8).
  const openTag = svg.match(/<svg x="8" y="8"[^>]*>/)
  if (!openTag) throw new Error(`${id}-${theme}.svg: no icon block found`)
  const viewBox = openTag[0].match(/viewBox="([^"]+)"/)
  if (!viewBox) throw new Error(`${id}-${theme}.svg: icon block has no viewBox`)
  return {
    iconViewBox: viewBox[1],
    masked: svg.includes(`<mask id="${id}-${theme}_m"`),
  }
}

function renderBadge(id: string, theme: 'light' | 'dark') {
  const { container } = render(<PlatformBadge platform={id} theme={theme} />)
  const outer = container.querySelector('svg')
  if (!outer) throw new Error(`<PlatformBadge platform="${id}"> rendered no svg`)
  const inner = outer.querySelector('svg')
  if (!inner) throw new Error(`<PlatformBadge platform="${id}"> rendered no inner svg`)
  return {
    iconViewBox: inner.getAttribute('viewBox'),
    // Direct-child check, not ':scope > defs' — jsdom returns null for that
    // on SVG elements even when the <defs> is right there, which makes the
    // assertion pass no matter what the component did.
    clipped: [...outer.children].some((c) => c.tagName === 'defs'),
  }
}

const libraryPlatforms = readdirSync(PLATFORMS_DIR)
  .filter((id) => !id.startsWith('_') && !id.startsWith('.'))
  .filter((id) => existsSync(join(PLATFORMS_DIR, id, 'icon.svg')))
  .sort()

describe('PlatformBadge parity with the static badge generator', () => {
  it('has static badges to compare against', () => {
    expect(libraryPlatforms.length).toBeGreaterThan(0)
    expect(existsSync(join(BADGES_DIR, 'spotify-light.svg'))).toBe(true)
  })

  // The two shapes the bug report named, pinned to the values that make them
  // interesting so the fixtures cannot silently stop exercising each case.
  it('renders a tight-viewBox bare mark (spotify) like the generator', () => {
    const truth = readStaticBadge('spotify', 'light')
    expect(truth.iconViewBox).toBe('8 8 24 24')
    expect(truth.masked).toBe(false)

    const actual = renderBadge('spotify', 'light')
    expect(actual.iconViewBox).toBe('8 8 24 24')
    expect(actual.clipped).toBe(false)
  })

  it('renders a self-clipped plate (apple) like the generator', () => {
    const truth = readStaticBadge('apple', 'light')
    expect(truth.iconViewBox).toBe('0 0 32 32')
    expect(truth.masked).toBe(false)

    const actual = renderBadge('apple', 'light')
    expect(actual.iconViewBox).toBe('0 0 32 32')
    // The plate carries its own squircle clipPath; adding a second one here
    // is what the generator deliberately does not do.
    expect(actual.clipped).toBe(false)
  })

  it('renders the one 2 2 28 28 badge (netflix) like the generator', () => {
    expect(readStaticBadge('netflix', 'light').iconViewBox).toBe('2 2 28 28')
    expect(renderBadge('netflix', 'light').iconViewBox).toBe('2 2 28 28')
  })

  it('uses the dark badge viewBox when a platform ships badge-dark.svg', () => {
    // truefans has its own dark artwork, so the dark variant must resolve to
    // that file's viewBox rather than the light badge's or the icon's.
    const truth = readStaticBadge('truefans', 'dark')
    expect(renderBadge('truefans', 'dark').iconViewBox).toBe(truth.iconViewBox)
  })

  it.each(libraryPlatforms)('%s matches the static badge in both themes', (id) => {
    for (const theme of ['light', 'dark'] as const) {
      const truth = readStaticBadge(id, theme)
      const actual = renderBadge(id, theme)
      expect(actual.iconViewBox, `${id}-${theme} viewBox`).toBe(truth.iconViewBox)
      expect(actual.clipped, `${id}-${theme} clip`).toBe(truth.masked)
    }
  })
})
