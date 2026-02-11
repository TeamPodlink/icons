export { platforms, getPlatform } from './platforms.js'
export { shapes } from './shapes.js'
export { resolveBadgeContent, resolveBadgeViewBox } from './resolve.js'
export { extractSvgContent, extractViewBox, prefixIds, minifySvg } from './svg.js'

export type { Platform, IconData, IconShape, ShapeDefinition } from './types.js'

// Re-export icon data access
import { iconDataMap } from '../generated/icons.js'
import type { IconData } from './types.js'

const warnedIds = new Set<string>()

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const __DEV__ = (globalThis as any).process?.env?.NODE_ENV !== 'production'

export function getIconData(platformId: string): IconData | undefined {
  const data = iconDataMap[platformId]
  if (!data && __DEV__ && !warnedIds.has(platformId)) {
    warnedIds.add(platformId)
    console.warn(
      `[@podlink/icons] Unknown platform "${platformId}". Check the platform ID is correct.`,
    )
  }
  return data
}
