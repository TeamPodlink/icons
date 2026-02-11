#!/usr/bin/env tsx

/**
 * Validate source icons and platforms.json consistency.
 * Run via: pnpm validate
 * Exits with code 1 if any errors found.
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { extractSvgContent } from '../src/core/svg.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

const SOURCE_DIR = join(ROOT, 'src/source-icons')
const PLATFORMS_FILE = join(ROOT, 'src/data/platforms.json')

const ICON_VIEWBOXES = ['0 0 32 32']
const BADGE_VIEWBOXES = ['0 0 32 32', '8 8 24 24']

let totalErrors = 0
let totalWarnings = 0

function error(msg: string) {
  console.error(`    ERROR: ${msg}`)
  totalErrors++
}

function warn(msg: string) {
  console.warn(`    warn: ${msg}`)
  totalWarnings++
}

// ── SVG file validation ───────────────────────────────────────────

function validateSvgFile(filePath: string, label: string, allowedViewBoxes: string[]) {
  const raw = readFileSync(filePath, 'utf-8')

  // Valid SVG structure
  try {
    extractSvgContent(raw)
  } catch {
    error(`${label} is not valid SVG (no <svg> element found)`)
    return
  }

  // xmlns attribute
  if (!/<svg[^>]*\sxmlns=["']http:\/\/www\.w3\.org\/2000\/svg["']/i.test(raw)) {
    error(`${label} missing xmlns="http://www.w3.org/2000/svg"`)
  }

  // viewBox presence and value
  const viewBoxMatch = raw.match(/<svg[^>]*\sviewBox=["']([^"']+)["']/)
  if (!viewBoxMatch) {
    error(`${label} missing viewBox attribute`)
  } else if (!allowedViewBoxes.includes(viewBoxMatch[1])) {
    error(
      `${label} viewBox="${viewBoxMatch[1]}" not in allowed values: ${allowedViewBoxes.join(', ')}`,
    )
  }

  // width/height attributes (warning only — stripped at build time)
  if (/<svg[^>]*\s(width|height)=/.test(raw)) {
    warn(`${label} has explicit width/height attributes (unnecessary, stripped at build time)`)
  }
}

// ── Per-platform validation ───────────────────────────────────────

function validatePlatform(id: string, dir: string) {
  const iconPath = join(dir, 'icon.svg')
  const badgePath = join(dir, 'badge.svg')
  const badgeDarkPath = join(dir, 'badge-dark.svg')

  // icon.svg is required
  if (!existsSync(iconPath)) {
    error('icon.svg is missing (required)')
    return
  }

  validateSvgFile(iconPath, 'icon.svg', ICON_VIEWBOXES)

  if (existsSync(badgePath)) {
    validateSvgFile(badgePath, 'badge.svg', BADGE_VIEWBOXES)
  }

  if (existsSync(badgeDarkPath)) {
    validateSvgFile(badgeDarkPath, 'badge-dark.svg', BADGE_VIEWBOXES)

    // Check if badge-dark.svg is identical to badge.svg
    if (existsSync(badgePath)) {
      const badge = readFileSync(badgePath, 'utf-8').trim()
      const badgeDark = readFileSync(badgeDarkPath, 'utf-8').trim()
      if (badge === badgeDark) {
        warn('badge-dark.svg is identical to badge.svg (unnecessary file)')
      }
    }
  }
}

// ── Cross-reference validation ────────────────────────────────────

function validateCrossReferences(platformDirs: string[], jsonIds: string[]) {
  const dirSet = new Set(platformDirs)
  const jsonSet = new Set(jsonIds)

  // Platform ID format
  for (const id of [...dirSet, ...jsonSet]) {
    if (!/^[a-z][a-z0-9]*$/.test(id)) {
      error(`platform ID "${id}" must be lowercase alphanumeric starting with a letter`)
    }
  }

  // Directories missing from platforms.json
  const missingJson = platformDirs.filter((id) => !jsonSet.has(id)).sort()
  for (const id of missingJson) {
    error(`source-icons/${id}/ has no entry in platforms.json`)
  }

  // platforms.json entries missing directories
  const missingDirs = jsonIds.filter((id) => !dirSet.has(id)).sort()
  for (const id of missingDirs) {
    error(`platforms.json entry "${id}" has no source-icons directory`)
  }
}

// ── Main ──────────────────────────────────────────────────────────

function main() {
  console.log('Validating source icons...\n')

  if (!existsSync(SOURCE_DIR)) {
    console.error(`Source directory not found: ${SOURCE_DIR}`)
    process.exit(1)
  }

  // Discover platform directories (skip _ and . prefixed, same as codegen)
  const platformDirs = readdirSync(SOURCE_DIR)
    .filter((name) => {
      if (name.startsWith('_') || name.startsWith('.')) return false
      return statSync(join(SOURCE_DIR, name)).isDirectory()
    })
    .sort()

  // Load platforms.json
  const data = JSON.parse(readFileSync(PLATFORMS_FILE, 'utf-8'))
  const jsonIds: string[] = (data.platforms || []).map((p: { id: string }) => p.id)

  // Cross-reference checks
  console.log('Cross-references:')
  const errorsBefore = totalErrors
  const warnsBefore = totalWarnings
  validateCrossReferences(platformDirs, jsonIds)
  if (totalErrors === errorsBefore && totalWarnings === warnsBefore) {
    console.log('    ok')
  }
  console.log()

  // Per-platform checks
  for (const id of platformDirs) {
    console.log(`  ${id}`)
    validatePlatform(id, join(SOURCE_DIR, id))
  }

  console.log(`\n${totalErrors} error(s), ${totalWarnings} warning(s)`)
  process.exit(totalErrors > 0 ? 1 : 0)
}

main()
