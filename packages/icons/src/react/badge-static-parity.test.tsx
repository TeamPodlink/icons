import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { readFileSync, readdirSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { PlatformBadge } from './PlatformBadge.js'
import { minifySvg } from '../core/svg.js'
import { getIconData } from '../core/index.js'
import { resolveBadgeContent, resolveBadgeRootFill } from '../core/resolve.js'

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
 * Placement parity is not enough on its own. gpodder and podurama matched on
 * viewBox and clip and still rendered wrong, because the CONTENT differed:
 * codegen dropped the source's root `fill="none"` and ran the markup through
 * svgo, while the generator did neither. So these tests also compare the
 * artwork itself and the fill it is drawn under. Both generators now read
 * the same source bytes, which makes the comparison exact rather than
 * approximate — no rasterizing, no tolerance.
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
   * Root fill the generator put on that same <svg>, carried over from the
   * source file's root element. undefined when the source declared none.
   */
  iconRootFill: string | undefined
  /** The artwork itself, id prefix normalized away. */
  iconContent: string
  /**
   * Whether the generator wrapped the icon block in its own squircle mask,
   * which it only does when falling back to icon.svg. Matched by id, because
   * some artwork (deezer, podcastguru) contains <mask> elements of its own.
   */
  masked: boolean
}

/**
 * Both generators prefix the ids inside the artwork, but with different
 * prefixes — codegen uses `<id>-badge`/`<id>-badge-dark`, the static
 * generator uses `<id>-<theme>`. Normalize both to the same placeholder so
 * the comparison is about the artwork and not about which generator wrote it.
 */
function normalizeIds(content: string, prefix: string): string {
  return minifySvg(content.split(`${prefix}_`).join('«p»_'))
}

function readStaticBadge(id: string, theme: 'light' | 'dark'): StaticBadge {
  const svg = readFileSync(join(BADGES_DIR, `${id}-${theme}.svg`), 'utf-8')
  // The icon block is the nested <svg> placed at the 24x24 box at (8,8).
  const openTag = svg.match(/<svg x="8" y="8"[^>]*>/)
  if (!openTag) throw new Error(`${id}-${theme}.svg: no icon block found`)
  const viewBox = openTag[0].match(/viewBox="([^"]+)"/)
  if (!viewBox) throw new Error(`${id}-${theme}.svg: icon block has no viewBox`)

  // Walk to the icon block's matching close tag; the artwork may nest <svg>.
  const start = svg.indexOf(openTag[0])
  let depth = 0
  let cursor = start
  let end = -1
  for (;;) {
    const open = svg.indexOf('<svg', cursor + 1)
    const close = svg.indexOf('</svg>', cursor + 1)
    if (close < 0) throw new Error(`${id}-${theme}.svg: unbalanced icon block`)
    if (open >= 0 && open < close) {
      depth++
      cursor = open
      continue
    }
    if (depth === 0) {
      end = close
      break
    }
    depth--
    cursor = close
  }

  return {
    iconViewBox: viewBox[1],
    iconRootFill: openTag[0].match(/\sfill="([^"]+)"/)?.[1],
    iconContent: normalizeIds(
      svg.slice(start + openTag[0].length, end),
      `${id}-${theme}`,
    ),
    masked: svg.includes(`<mask id="${id}-${theme}_m"`),
  }
}

/**
 * What the component will put inside its nested <svg>, normalized the same
 * way. Taken from the resolvers rather than the rendered DOM because jsdom
 * rewrites the markup it parses, which would compare jsdom's serializer
 * against the generator instead of the two generators against each other.
 */
function libraryArtwork(id: string, theme: 'light' | 'dark') {
  const data = getIconData(id)
  if (!data) throw new Error(`no icon data for ${id}`)
  const fg = theme === 'dark' ? '#fff' : '#000'
  const prefix = data.badgeDark && theme === 'dark' ? `${id}-badge-dark` : `${id}-badge`
  const content = resolveBadgeContent(data, theme).split('currentColor').join(fg)
  return {
    content: normalizeIds(content, data.badge || data.badgeDark ? prefix : id),
    rootFill: resolveBadgeRootFill(data, theme),
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
    // null when React omitted the attribute, which is what it does for an
    // undefined prop — the same "no root fill" the generator expresses by
    // leaving it off.
    iconRootFill: inner.getAttribute('fill'),
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

  // ── Content ──────────────────────────────────────────────────────
  //
  // Placement can match while the artwork does not. These catch the class of
  // bug that viewBox and clip parity cannot see.

  it.each(libraryPlatforms)('%s carries the same artwork as the static badge', (id) => {
    for (const theme of ['light', 'dark'] as const) {
      expect(libraryArtwork(id, theme).content, `${id}-${theme} content`).toBe(
        readStaticBadge(id, theme).iconContent,
      )
    }
  })

  it.each(libraryPlatforms)('%s draws under the same root fill as the static badge', (id) => {
    for (const theme of ['light', 'dark'] as const) {
      const truth = readStaticBadge(id, theme)
      expect(libraryArtwork(id, theme).rootFill, `${id}-${theme} stored root fill`).toBe(
        truth.iconRootFill,
      )
      // ...and the component has to actually put it on the element.
      expect(renderBadge(id, theme).iconRootFill, `${id}-${theme} rendered root fill`).toBe(
        truth.iconRootFill ?? null,
      )
    }
  })

  // The two platforms the root-fill bug actually damaged. Pinned by name and
  // by value: both draw paths that carry a stroke and no fill of their own,
  // so losing the inherited fill="none" fills them black. They matched on
  // viewBox and clip throughout, which is why those assertions alone were
  // not enough.
  it.each(['gpodder', 'podurama'])(
    '%s keeps the root fill="none" its stroke-only paths depend on',
    (id) => {
      for (const theme of ['light', 'dark'] as const) {
        expect(readStaticBadge(id, theme).iconRootFill, `${id}-${theme} generator`).toBe('none')
        expect(libraryArtwork(id, theme).rootFill, `${id}-${theme} library`).toBe('none')
        expect(renderBadge(id, theme).iconRootFill, `${id}-${theme} rendered`).toBe('none')
      }
    },
  )

  // A platform whose source declares no root fill must not gain one.
  it('leaves the fill off when the source declares none', () => {
    const bare = libraryPlatforms.find(
      (id) => readStaticBadge(id, 'light').iconRootFill === undefined,
    )
    expect(bare, 'expected at least one badge with no root fill').toBeDefined()
    expect(libraryArtwork(bare!, 'light').rootFill).toBeUndefined()
    expect(renderBadge(bare!, 'light').iconRootFill).toBeNull()
  })
})
