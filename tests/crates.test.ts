import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../src/game/rng'
import { openCrate } from '../src/game/crates'
import { newGame } from '../src/game/state'

describe('开箱系统', () => {
  it('无小箱时阻塞', () => {
    const s = newGame('T', 0)
    const events = openCrate(s, mulberry32(1))
    expect(events.some((e) => e.type === 'blocked')).toBe(true)
  })

  it('金币分支（r < 0.45）：消耗 1 箱、计数 +1、金币按 rng 决定', () => {
    const s = newGame('T', 0)
    s.materials['crate'] = 2
    const events = openCrate(s, { next: () => 0.1 }) // 20 + floor(0.1×31) = 23
    expect(s.materials['crate']).toBe(1)
    expect(s.stats.totalCratesOpened).toBe(1)
    expect(s.gold).toBe(23)
    expect(s.stats.totalGoldEarned).toBe(23)
    expect(events.some((e) => e.type === 'crateOpened')).toBe(true)
  })

  it('大奖分支（r < 0.03）', () => {
    const s = newGame('T', 0)
    s.materials['crate'] = 1
    openCrate(s, { next: () => 0.01 })
    expect(s.gold).toBe(300)
    expect(s.stats.totalGoldEarned).toBe(300)
  })

  it('精华分支（0.45 ≤ r < 0.80）', () => {
    const s = newGame('T', 0)
    s.materials['crate'] = 1
    openCrate(s, { next: () => 0.5 }) // 1 + floor(0.5×2) = 2
    expect(s.materials['essence']).toBe(2)
  })

  it('煤分支（r ≥ 0.80）', () => {
    const s = newGame('T', 0)
    s.materials['crate'] = 1
    openCrate(s, { next: () => 0.9 }) // 8 + floor(0.9×9) = 16
    expect(s.materials['coal']).toBe(16)
  })
})
