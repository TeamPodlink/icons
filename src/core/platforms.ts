import type { Platform } from './types.js'
import platformData from '../data/platforms.json'

const platformMap = new Map<string, Platform>()

for (const p of platformData.platforms) {
  platformMap.set(p.id, p)
}

export const platforms: Platform[] = platformData.platforms

export function getPlatform(id: string): Platform | undefined {
  return platformMap.get(id)
}
