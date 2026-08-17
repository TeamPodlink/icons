import type { IconData } from './types.js'

/**
 * Resolve which SVG content to use for a badge variant.
 *
 * Light: badge → icon content
 * Dark:  badgeDark → badge → icon content
 */
export function resolveBadgeContent(data: IconData, variant: 'light' | 'dark'): string {
  if (variant === 'dark') {
    return data.badgeDark ?? data.badge ?? data.content
  }
  return data.badge ?? data.content
}

/**
 * Resolve viewBox for badge — badge SVGs may have different viewBoxes,
 * but in practice they share the same viewBox as the icon.
 */
export function resolveBadgeViewBox(data: IconData): string {
  return data.viewBox
}
