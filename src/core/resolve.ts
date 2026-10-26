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
 * Resolve the viewBox belonging to the selected badge content.
 * Defaults to light for existing one-argument callers. Legacy data without
 * badge coordinates retains the icon viewBox.
 */
export function resolveBadgeViewBox(data: IconData, variant: 'light' | 'dark' = 'light'): string {
  if (variant === 'dark' && data.badgeDark != null) {
    return data.badgeDarkViewBox ?? data.viewBox
  }
  if (data.badge != null) return data.badgeViewBox ?? data.viewBox
  return data.viewBox
}
