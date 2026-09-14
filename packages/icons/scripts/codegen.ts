#!/usr/bin/env tsx

/**
 * Codegen script: reads src/source-icons/ and generates:
 * - src/generated/icons.ts     — map of platform id → IconData (viewBox, content,
 *                                 rootFill?, badge?/badgeViewBox?/badgeRootFill?,
 *                                 badgeDark?/badgeDarkViewBox?/badgeDarkRootFill?)
 * - src/generated/platform-ids.ts — TypeScript union type for autocomplete
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { extractSvgContent, extractViewBox, extractRootFill, prefixIds } from '../src/core/svg.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

const SOURCE_DIR = join(ROOT, '../../platforms')
const GENERATED_DIR = join(ROOT, 'src/generated')

function readSvgFile(path: string): string | undefined {
  if (!existsSync(path)) return undefined
  return readFileSync(path, 'utf-8')
}

interface Processed {
  viewBox: string
  content: string
  /**
   * The root <svg fill>, kept because extractSvgContent() throws the root
   * element away and a stroke-only path relies on inheriting it.
   */
  rootFill: string | null
}

/**
 * Read a source SVG into the three pieces icons.ts stores.
 *
 * DELIBERATELY NOT OPTIMIZED. This used to run svgo's preset-default, which
 * build-static.ts does not, so the library and the static files were built
 * from different markup and drifted by construction. svgo's saving here is
 * almost entirely convertPathData rounding coordinates to 3 decimals: of the
 * 7.4% it takes off the stored content, 6.8 points come from that one plugin
 * and everything else together accounts for 0.6%. The sources are clean
 * exports with no comments, metadata or editor namespaces to strip.
 *
 * Rounding is not free. Against the shipped static badges in headless Chrome,
 * at the 24px the default badge renders its icon at, the worst case went from
 * 0.00 (no svgo) to 9.23 (svgo) — visible, not sub-pixel. See "svgo in
 * codegen" in pipeline/README.md for the full table.
 */
function processSvg(raw: string, prefix: string): Processed {
  const viewBox = extractViewBox(raw)
  const rootFill = extractRootFill(raw)
  const content = prefixIds(extractSvgContent(raw), prefix)
  return { viewBox, content, rootFill }
}

function escapeForTemplate(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$')
}

function main() {
  console.log('Generating icon data...\n')

  if (!existsSync(SOURCE_DIR)) {
    console.error(`Source directory not found: ${SOURCE_DIR}`)
    process.exit(1)
  }

  mkdirSync(GENERATED_DIR, { recursive: true })

  // Assemble src/data/platforms.json from platforms/*/meta.json.
  // The library only carries the fields its Platform type declares; extended
  // facet metadata (categories, liquid glass bundles) is consumed by the
  // monorepo's pipeline and website, not this package.
  const metaIds = readdirSync(SOURCE_DIR)
    .filter((name) => {
      if (name.startsWith('_') || name.startsWith('.')) return false
      const dirPath = join(SOURCE_DIR, name)
      return statSync(dirPath).isDirectory() && existsSync(join(dirPath, 'meta.json'))
    })
    .sort()
  const platformsJson = {
    platforms: metaIds.map((id) => {
      const meta = JSON.parse(readFileSync(join(SOURCE_DIR, id, 'meta.json'), 'utf-8'))
      const { name, active, aliases, guidelinesUrl } = meta
    return { name, id, active, ...(aliases && { aliases }), ...(guidelinesUrl && { guidelinesUrl }) }
    }),
  }
  mkdirSync(join(ROOT, 'src/data'), { recursive: true })
  writeFileSync(
    join(ROOT, 'src/data/platforms.json'),
    JSON.stringify(platformsJson, null, 2) + '\n'
  )
  console.log(`  platforms.json: ${metaIds.length} platforms\n`)

  // Discover platform directories (skip _review and hidden dirs)
  const platformIds = readdirSync(SOURCE_DIR)
    .filter((name) => {
      if (name.startsWith('_') || name.startsWith('.')) return false
      const dirPath = join(SOURCE_DIR, name)
      return statSync(dirPath).isDirectory() && existsSync(join(dirPath, 'icon.svg'))
    })
    .sort()

  const entries: string[] = []

  for (const id of platformIds) {
    const dir = join(SOURCE_DIR, id)

    try {
      // Process icon.svg (required)
      const iconRaw = readFileSync(join(dir, 'icon.svg'), 'utf-8')
      const icon = processSvg(iconRaw, id)

      // Process badge.svg (optional)
      const badgeRaw = readSvgFile(join(dir, 'badge.svg'))
      let badge: Processed | undefined
      if (badgeRaw) {
        badge = processSvg(badgeRaw, `${id}-badge`)
      }

      // Process badge-dark.svg (optional)
      const badgeDarkRaw = readSvgFile(join(dir, 'badge-dark.svg'))
      let badgeDark: Processed | undefined
      if (badgeDarkRaw) {
        badgeDark = processSvg(badgeDarkRaw, `${id}-badge-dark`)
      }

      let entry = `  '${id}': {\n`
      entry += `    viewBox: '${icon.viewBox}',\n`
      entry += `    content: \`${escapeForTemplate(icon.content)}\`,\n`
      if (icon.rootFill) {
        entry += `    rootFill: '${icon.rootFill}',\n`
      }
      if (badge) {
        entry += `    badge: \`${escapeForTemplate(badge.content)}\`,\n`
        entry += `    badgeViewBox: '${badge.viewBox}',\n`
        if (badge.rootFill) {
          entry += `    badgeRootFill: '${badge.rootFill}',\n`
        }
      }
      if (badgeDark) {
        entry += `    badgeDark: \`${escapeForTemplate(badgeDark.content)}\`,\n`
        entry += `    badgeDarkViewBox: '${badgeDark.viewBox}',\n`
        if (badgeDark.rootFill) {
          entry += `    badgeDarkRootFill: '${badgeDark.rootFill}',\n`
        }
      }
      entry += `  }`

      entries.push(entry)
      console.log(`  ${id}`)
    } catch (e: unknown) {
      console.error(`  ${id}: ${e instanceof Error ? e.message : e}`)
    }
  }

  // Write icons.ts
  const iconsTs = `// Auto-generated by scripts/codegen.ts — do not edit
import type { IconData } from '../core/types.js'

export const iconDataMap: Record<string, IconData> = {
${entries.join(',\n')}
}
`

  writeFileSync(join(GENERATED_DIR, 'icons.ts'), iconsTs)

  // Write platform-ids.ts
  const unionType = platformIds.map((id) => `  | '${id}'`).join('\n')
  const platformIdsTs = `// Auto-generated by scripts/codegen.ts — do not edit

export type PlatformId =
${unionType}
`

  writeFileSync(join(GENERATED_DIR, 'platform-ids.ts'), platformIdsTs)

  console.log(`\n${platformIds.length} platforms generated`)
}

main()
