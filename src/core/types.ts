export type IconShape = 'square' | 'circle' | 'superellipse'

export interface Platform {
  id: string
  name: string
  active: boolean
  aliases?: string[]
  guidelinesUrl?: string
  /** Default badge text; omitted platforms retain "Listen on". */
  badgeLabel?: string
}

export interface IconData {
  viewBox: string
  content: string
  badge?: string
  /** Coordinates of badge artwork; legacy data falls back to viewBox. */
  badgeViewBox?: string
  badgeDark?: string
  /** Coordinates of dark badge artwork; legacy data falls back to viewBox. */
  badgeDarkViewBox?: string
}

export interface ShapeDefinition {
  svgPath(size: number): string
  clipPath(size: number): string
}
