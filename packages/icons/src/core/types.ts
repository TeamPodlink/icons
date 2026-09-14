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
}

export interface ShapeDefinition {
  svgPath(size: number): string
  clipPath(size: number): string
}
