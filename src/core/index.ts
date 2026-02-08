export { platforms, getPlatform } from './platforms.js'
export { shapes } from './shapes.js'
export { resolveBadgeContent, resolveBadgeViewBox } from './resolve.js'
export {
  extractSvgContent,
  extractViewBox,
  prefixIds,
  minifySvg,
} from './svg.js'

export type { Platform, IconData, IconShape, ShapeDefinition } from './types.js'

// Re-export icon data access
import { iconDataMap } from '../generated/icons.js'
import type { IconData } from './types.js'

export function getIconData(platformId: string): IconData | undefined {
  return iconDataMap[platformId]
}
