import type { Platform } from './types.js'
import type { PlatformId } from '../generated/platform-ids.js'
import platformData from '../data/platforms.json'

const platformMap = new Map<string, Platform>()
const platformIdMap = new Map<string, PlatformId>()

function normalizePlatformInput(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

for (const p of platformData.platforms) {
  platformMap.set(p.id, p)
  platformIdMap.set(normalizePlatformInput(p.id), p.id as PlatformId)

  for (const alias of p.aliases ?? []) {
    platformIdMap.set(normalizePlatformInput(alias), p.id as PlatformId)
  }
}

export const platforms: Platform[] = platformData.platforms

export function resolvePlatformId(input: string): PlatformId | undefined {
  return platformIdMap.get(normalizePlatformInput(input))
}

export function getPlatform(id: string): Platform | undefined {
  const platformId = resolvePlatformId(id)
  return platformId ? platformMap.get(platformId) : undefined
}
