export type IconShape = 'square' | 'circle' | 'superellipse'

export interface Platform {
  id: string
  name: string
  active: boolean
  aliases?: string[]
  guidelinesUrl?: string
}

export interface IconData {
  viewBox: string
  content: string
  /**
   * Badge artwork is authored independently of the icon and usually carries a
   * tighter viewBox (41 of 67 badges today), so it gets its own. Absent when
   * the platform has no badge.svg and the badge falls back to the icon.
   */
  badge?: string
  badgeViewBox?: string
  badgeDark?: string
  badgeDarkViewBox?: string
  /**
   * The root <svg fill> of the source file, which has to travel with the
   * content because `content` is the INNER markup — the root element that
   * carried the fill is gone by the time it is stored.
   *
   * It is not decoration. `fill="none"` on the root is how a stroke-only
   * path is kept from being filled (see CLAUDE.md's root-`fill` convention);
   * drop it and that path inherits the SVG default of black. Today gpodder
   * and podurama both depend on it in icon.svg and badge.svg alike.
   */
  rootFill?: string
  badgeRootFill?: string
  badgeDarkRootFill?: string
}

export interface ShapeDefinition {
  svgPath(size: number): string
  clipPath(size: number): string
}
