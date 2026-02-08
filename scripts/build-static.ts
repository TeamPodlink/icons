#!/usr/bin/env tsx

/**
 * Generate static SVG assets:
 * 1. Superellipse-clipped icons (32x32) → static/icons/
 * 2. "Listen on" badges (light + dark, text-to-path) → static/badges/
 *
 * Ported from podcast-badges/scripts/generate-assets.mjs
 */

import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
} from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import opentype from 'opentype.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

const SOURCE_DIR = join(ROOT, 'src/source-icons')
const ICONS_DIR = join(ROOT, 'static/icons')
const BADGES_DIR = join(ROOT, 'static/badges')
const PLATFORMS_FILE = join(ROOT, 'src/data/platforms.json')
const FONT_PATH = join(
  ROOT,
  'node_modules/@fontsource/inter/files/inter-latin-400-normal.woff',
)

// iOS-style squircle (superellipse) clip paths
const SQUIRCLE_32 =
  'M16 0c12.357 0 16 3.643 16 16s-3.643 16-16 16S0 28.357 0 16 3.643 0 16 0Z'
const SQUIRCLE_24 =
  'M12 0c9.268 0 12 2.732 12 12s-2.732 12-12 12S0 21.268 0 12 2.732 0 12 0Z'

// Platforms with custom badge text (instead of "Listen on" / platform name)
const BADGE_TEXT_OVERRIDES: Record<string, { small: string; large: string }> = {
  rss: { small: 'Get the', large: 'RSS Feed' },
  subscribebyemail: { small: 'Subscribe by', large: 'Email' },
  subscribeonandroid: { small: 'Subscribe on', large: 'Android' },
  youtube: { small: 'Watch on', large: 'YouTube' },
}

// Badge layout constants (derived from CSS)
const BADGE_H = 40
const ICON_X = 8
const ICON_Y = 8 // (40 - 24) / 2
const ICON_SIZE = 24
const TEXT_X = 38 // ICON_X + ICON_SIZE + 6px gap
const PAD_RIGHT = 10

// Text spec
const SMALL_FONT_SIZE = 8.5
const SMALL_LINE_HEIGHT = 8
const LARGE_FONT_SIZE = 17.5
const LARGE_LINE_HEIGHT = 16
const LARGE_LETTER_SPACING = -0.25

let font: opentype.Font

function loadFont() {
  if (!existsSync(FONT_PATH)) {
    console.error('Inter font not found. Run: pnpm install')
    process.exit(1)
  }
  font = opentype.loadSync(FONT_PATH)
}

function baselineY(
  lineBoxTop: number,
  lineHeight: number,
  fontSize: number,
): number {
  const scale = fontSize / font.unitsPerEm
  const asc = font.ascender * scale
  const desc = font.descender * scale
  const halfLeading = (lineHeight - (asc - desc)) / 2
  return lineBoxTop + halfLeading + asc
}

function textToPath(
  text: string,
  x: number,
  y: number,
  fontSize: number,
  letterSpacing = 0,
): string {
  if (letterSpacing === 0) {
    return font.getPath(text, x, y, fontSize).toPathData(2)
  }

  const glyphs = font.stringToGlyphs(text)
  const scale = fontSize / font.unitsPerEm
  const path = new opentype.Path()
  let cx = x

  for (let i = 0; i < glyphs.length; i++) {
    const glyph = glyphs[i]
    const glyphPath = glyph.getPath(cx, y, fontSize)
    path.commands.push(...glyphPath.commands)
    cx += (glyph.advanceWidth ?? 0) * scale
    if (i < glyphs.length - 1) {
      cx += font.getKerningValue(glyphs[i], glyphs[i + 1]) * scale
      cx += letterSpacing
    }
  }

  return path.toPathData(2)
}

function textWidth(
  text: string,
  fontSize: number,
  letterSpacing = 0,
): number {
  const base = font.getAdvanceWidth(text, fontSize)
  if (letterSpacing === 0) return base
  return base + letterSpacing * (text.length - 1)
}

function extractSvgContent(svg: string): string {
  svg = svg.replace(/<\?xml[^>]*\?>/g, '')
  const m = svg.match(/<svg[^>]*>([\s\S]*)<\/svg>/i)
  if (!m) throw new Error('Invalid SVG')
  return m[1].trim()
}

function extractViewBox(svg: string): string {
  const m = svg.match(/viewBox=["']([^"']+)["']/)
  return m ? m[1] : '0 0 32 32'
}

function extractRootFill(svg: string): string | null {
  const m = svg.match(/<svg[^>]*\sfill=["']([^"']+)["']/)
  return m ? m[1] : null
}

function prefixIds(content: string, prefix: string): string {
  const ids = new Set<string>()
  for (const m of content.matchAll(/id="([^"]+)"/g)) ids.add(m[1])

  let result = content
  for (const id of ids) {
    const pid = `${prefix}_${id}`
    result = result.split(`id="${id}"`).join(`id="${pid}"`)
    result = result.split(`url(#${id})`).join(`url(#${pid})`)
    result = result.split(`href="#${id}"`).join(`href="#${pid}"`)
    result = result.split(`xlink:href="#${id}"`).join(`xlink:href="#${pid}"`)
  }
  return result
}

function minify(svg: string): string {
  return svg
    .replace(/\n\s*/g, '')
    .replace(/>\s+</g, '><')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

// ── Icon generation ────────────────────────────────────────────────

function generateIcon(sourceSvg: string, name: string): string {
  const content = prefixIds(extractSvgContent(sourceSvg), name)
  const viewBox = extractViewBox(sourceSvg)
  const fill = extractRootFill(sourceSvg)
  const fillAttr = fill ? ` fill="${fill}"` : ''

  return minify(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
    <mask id="${name}_m" width="32" height="32" x="0" y="0" maskUnits="userSpaceOnUse" style="mask-type:alpha">
      <path d="${SQUIRCLE_32}"/>
    </mask>
    <g mask="url(#${name}_m)">
      <svg viewBox="${viewBox}" width="32" height="32"${fillAttr}>${content}</svg>
    </g>
  </svg>`)
}

// ── Badge generation ───────────────────────────────────────────────

function generateBadge(
  badgeIconSvg: string,
  name: string,
  platformName: string,
  variant: 'light' | 'dark',
  isBadge: boolean,
): string {
  const isDark = variant === 'dark'
  const bg = isDark ? '#000' : '#fff'
  const fg = isDark ? '#fff' : '#000'
  const prefix = `${name}-${variant}`

  let iconContent = extractSvgContent(badgeIconSvg)
  const viewBox = extractViewBox(badgeIconSvg)
  const fill = extractRootFill(badgeIconSvg)
  const fillAttr = fill ? ` fill="${fill}"` : ''

  // Replace currentColor with the badge foreground color
  iconContent = iconContent.split('currentColor').join(fg)
  iconContent = prefixIds(iconContent, prefix)

  // Text layout
  const textBlockTop = (BADGE_H - (SMALL_LINE_HEIGHT + LARGE_LINE_HEIGHT)) / 2
  const smallY = baselineY(textBlockTop, SMALL_LINE_HEIGHT, SMALL_FONT_SIZE)
  const largeY = baselineY(
    textBlockTop + SMALL_LINE_HEIGHT,
    LARGE_LINE_HEIGHT,
    LARGE_FONT_SIZE,
  )

  const override = BADGE_TEXT_OVERRIDES[name]
  const smallText = override?.small ?? 'Listen on'
  const largeText = override?.large ?? platformName

  const smallPath = textToPath(smallText, TEXT_X, smallY, SMALL_FONT_SIZE)
  const largePath = textToPath(
    largeText,
    TEXT_X,
    largeY,
    LARGE_FONT_SIZE,
    LARGE_LETTER_SPACING,
  )

  const largeW = textWidth(
    largeText,
    LARGE_FONT_SIZE,
    LARGE_LETTER_SPACING,
  )
  const smallW = textWidth(smallText, SMALL_FONT_SIZE)
  const badgeW = Math.ceil(TEXT_X + Math.max(smallW, largeW) + PAD_RIGHT)

  // Badge files already contain correct clipping (squircle, circle, or none).
  // Only apply squircle mask when falling back to icon.svg.
  let iconBlock: string
  if (isBadge) {
    iconBlock = `<svg x="${ICON_X}" y="${ICON_Y}" width="${ICON_SIZE}" height="${ICON_SIZE}" viewBox="${viewBox}"${fillAttr}>${iconContent}</svg>`
  } else {
    iconBlock = `<mask id="${prefix}_m" width="${ICON_SIZE}" height="${ICON_SIZE}" x="${ICON_X}" y="${ICON_Y}" maskUnits="userSpaceOnUse" style="mask-type:alpha"><path d="${SQUIRCLE_24}" transform="translate(${ICON_X},${ICON_Y})"/></mask><g mask="url(#${prefix}_m)"><svg x="${ICON_X}" y="${ICON_Y}" width="${ICON_SIZE}" height="${ICON_SIZE}" viewBox="${viewBox}"${fillAttr}>${iconContent}</svg></g>`
  }

  return minify(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${badgeW} ${BADGE_H}">
    <rect width="${badgeW - 1}" height="${BADGE_H - 1}" x=".5" y=".5" fill="${bg}" stroke="#A6A6A6" rx="5"/>
    ${iconBlock}
    <path fill="${fg}" d="${smallPath}"/>
    <path fill="${fg}" d="${largePath}"/>
  </svg>`)
}

function resolveBadgeIcon(
  dir: string,
  variant: 'light' | 'dark',
): { svg: string; isBadge: boolean } {
  if (variant === 'dark') {
    const darkPath = join(dir, 'badge-dark.svg')
    if (existsSync(darkPath))
      return { svg: readFileSync(darkPath, 'utf-8'), isBadge: true }
  }
  const badgePath = join(dir, 'badge.svg')
  if (existsSync(badgePath))
    return { svg: readFileSync(badgePath, 'utf-8'), isBadge: true }
  return { svg: readFileSync(join(dir, 'icon.svg'), 'utf-8'), isBadge: false }
}

// ── Main ───────────────────────────────────────────────────────────

function main() {
  console.log('Generating static SVG assets...\n')
  loadFont()

  mkdirSync(ICONS_DIR, { recursive: true })
  mkdirSync(BADGES_DIR, { recursive: true })

  if (!existsSync(SOURCE_DIR)) {
    console.error(`Source directory not found: ${SOURCE_DIR}`)
    process.exit(1)
  }

  // Load platform names
  const platformMap = new Map<string, string>()
  if (existsSync(PLATFORMS_FILE)) {
    const data = JSON.parse(readFileSync(PLATFORMS_FILE, 'utf-8'))
    for (const p of data.platforms || []) platformMap.set(p.id, p.name)
  }

  // Discover platform directories (skip _review)
  const platformDirs = readdirSync(SOURCE_DIR)
    .filter((name) => {
      if (name.startsWith('_')) return false
      const dirPath = join(SOURCE_DIR, name)
      return (
        statSync(dirPath).isDirectory() &&
        existsSync(join(dirPath, 'icon.svg'))
      )
    })
    .sort()

  let icons = 0
  let badges = 0

  for (const name of platformDirs) {
    const dir = join(SOURCE_DIR, name)
    const iconSvg = readFileSync(join(dir, 'icon.svg'), 'utf-8')
    const platformName =
      platformMap.get(name) || name.charAt(0).toUpperCase() + name.slice(1)

    try {
      writeFileSync(join(ICONS_DIR, `${name}.svg`), generateIcon(iconSvg, name))
      icons++

      const darkBadgeIcon = resolveBadgeIcon(dir, 'dark')
      const lightBadgeIcon = resolveBadgeIcon(dir, 'light')

      writeFileSync(
        join(BADGES_DIR, `${name}-dark.svg`),
        generateBadge(darkBadgeIcon.svg, name, platformName, 'dark', darkBadgeIcon.isBadge),
      )
      writeFileSync(
        join(BADGES_DIR, `${name}-light.svg`),
        generateBadge(lightBadgeIcon.svg, name, platformName, 'light', lightBadgeIcon.isBadge),
      )
      badges += 2

      console.log(`  ${name}`)
    } catch (e: any) {
      console.error(`  ${name}: ${e.message}`)
    }
  }

  console.log(`\n${icons} icons, ${badges} badges`)
}

main()
