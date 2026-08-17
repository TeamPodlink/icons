export { platforms, getPlatform, resolvePlatformId } from './platforms.js'
export { shapes } from './shapes.js'
export { resolveBadgeContent, resolveBadgeViewBox } from './resolve.js'
export { extractSvgContent, extractViewBox, prefixIds, minifySvg } from './svg.js'

export type { Platform, IconData, IconShape, ShapeDefinition } from './types.js'
export type { PlatformId } from '../generated/platform-ids.js'

// Re-export icon data access
import { iconDataMap } from '../generated/icons.js'
import type { IconData } from './types.js'
import { resolvePlatformId } from './platforms.js'

const warnedIds = new Set<string>()

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const __DEV__ = (globalThis as any).process?.env?.NODE_ENV !== 'production'

export function getIconData(platformId: string): IconData | undefined {
  const resolvedPlatformId = resolvePlatformId(platformId)
  const data = resolvedPlatformId ? iconDataMap[resolvedPlatformId] : undefined
  if (!data && __DEV__ && !warnedIds.has(platformId)) {
    warnedIds.add(platformId)
    console.warn(
      `[@podlink/icons] Unknown platform "${platformId}". Check the platform ID is correct.`,
    )
  }
  return data
}

export function hasPlatformIcon(input: string): boolean {
  const platformId = resolvePlatformId(input)
  return platformId ? Boolean(iconDataMap[platformId]) : false
}
