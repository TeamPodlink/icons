import { describe, expect, it } from 'vitest'
import { getIconData, getPlatform, hasPlatformIcon, resolvePlatformId } from './index.js'

describe('platform resolution', () => {
  it('returns canonical IDs unchanged', () => {
    expect(resolvePlatformId('amazonmusic')).toBe('amazonmusic')
  })

  it('resolves metadata aliases to canonical IDs', () => {
    expect(resolvePlatformId('amazon')).toBe('amazonmusic')
    expect(getPlatform('amazon')?.id).toBe('amazonmusic')
  })

  it('normalizes common slug and vanity slug input', () => {
    expect(resolvePlatformId('Amazon Music')).toBe('amazonmusic')
    expect(resolvePlatformId('amazon-music')).toBe('amazonmusic')
  })

  it('returns undefined for unknown IDs', () => {
    expect(resolvePlatformId('not-a-platform')).toBeUndefined()
    expect(getPlatform('not-a-platform')).toBeUndefined()
  })
})

describe('icon lookup resolution', () => {
  it('accepts aliases in getIconData', () => {
    expect(getIconData('amazon')).toBe(getIconData('amazonmusic'))
  })

  it('reports whether aliases and canonical IDs have icon data', () => {
    expect(hasPlatformIcon('amazon')).toBe(true)
    expect(hasPlatformIcon('amazonmusic')).toBe(true)
    expect(hasPlatformIcon('greatpods')).toBe(true)
    expect(hasPlatformIcon('not-a-platform')).toBe(false)
  })
})
