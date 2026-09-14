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

/**
 * Whether resolveBadgeContent picked badge artwork rather than falling back
 * to the icon.
 *
 * Badge artwork already carries whatever clipping it is meant to have: 26 of
 * the 67 badges wrap themselves in a squircle or circle clipPath, and the
 * other 41 are bare marks that must not be clipped at all. Only the icon
 * fallback needs a shape applied to it.
 */
export function hasBadgeArtwork(data: IconData, variant: 'light' | 'dark'): boolean {
  if (variant === 'dark') return Boolean(data.badgeDark ?? data.badge)
  return Boolean(data.badge)
}

/**
 * Resolve the root <svg fill> that goes with resolveBadgeContent's result.
 *
 * Must walk the same fallback chain as the content, and for the same reason
 * the viewBox does: the fill belongs to the file the content came from, and
 * badge.svg, badge-dark.svg and icon.svg can each declare a different one.
 *
 * Returns undefined when that file declared no root fill, which is the
 * common case — 113 of the 142 source files carry one, but only gpodder's
 * and podurama's actually have a stroke-only path depending on it.
 */
export function resolveBadgeRootFill(
  data: IconData,
  variant: 'light' | 'dark',
): string | undefined {
  if (variant === 'dark') {
    if (data.badgeDark) return data.badgeDarkRootFill
    if (data.badge) return data.badgeRootFill
    return data.rootFill
  }
  if (data.badge) return data.badgeRootFill
  return data.rootFill
}
