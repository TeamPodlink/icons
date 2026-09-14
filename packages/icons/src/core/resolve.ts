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
 * Resolve the viewBox that goes with resolveBadgeContent's result.
 *
 * Badge artwork is authored independently of icon.svg and most of it uses a
 * tighter viewBox than the icon's "0 0 32 32" — rendering that content into
 * the icon's viewBox scales it down and offsets it. Each fallback step must
 * therefore carry its own viewBox, and the last one falls through to the
 * icon's because that step really is the icon.
 */
export function resolveBadgeViewBox(data: IconData, variant: 'light' | 'dark'): string {
  if (variant === 'dark') {
    if (data.badgeDark) return data.badgeDarkViewBox ?? data.viewBox
    if (data.badge) return data.badgeViewBox ?? data.viewBox
    return data.viewBox
  }
  if (data.badge) return data.badgeViewBox ?? data.viewBox
  return data.viewBox
}
