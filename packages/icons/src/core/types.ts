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
  badge?: string
  badgeDark?: string
}

export interface ShapeDefinition {
  svgPath(size: number): string
  clipPath(size: number): string
}
