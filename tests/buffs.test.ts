import { describe, expect, it } from 'vitest'
import { BUFF_EXTEND_CAP_MS, buffBonuses, pruneBuffs, useRune } from '../src/game/buffs'
import { newGame } from '../src/game/state'

const T0 = 1_000_000

describe('符文增益系统（v1.4）', () => {
  it('激活符文：消耗 1 个并进入增益槽（10 分钟）', () => {
    const s = newGame('T', 0)
    s.materials['rune_speed_1'] = 2
    const ev = useRune(s, 'rune_speed_1', T0)
    expect(ev.some((e) => e.type === 'buffActivated')).toBe(true)
    expect(s.materials['rune_speed_1']).toBe(1)
    expect(s.buffs.length).toBe(1)
    expect(s.buffs[0].until).toBe(T0 + 600_000)
  })

  it('无符文时阻塞；非符文物品阻塞', () => {
    const s = newGame('T', 0)
    expect(useRune(s, 'rune_speed_1', T0).some((e) => e.type === 'blocked')).toBe(true)
    s.materials['ore_copper'] = 5
    const ev = useRune(s, 'ore_copper', T0)
    expect(ev.some((e) => e.type === 'blocked' && e.reason.includes('不是符文'))).toBe(true)
  })

  it('同种符文叠加时长（上限 60 分钟）', () => {
    const s = newGame('T', 0)
    s.materials['rune_speed_1'] = 20
    useRune(s, 'rune_speed_1', T0)
    useRune(s, 'rune_speed_1', T0)
    expect(s.buffs.length).toBe(1)
    expect(s.buffs[0].until).toBe(T0 + 1_200_000)
    for (let i = 0; i < 10; i++) useRune(s, 'rune_speed_1', T0)
    expect(s.buffs[0].until).toBe(T0 + BUFF_EXTEND_CAP_MS)
  })

  it('异种符文：空槽放入；满槽替换剩余最短者', () => {
    const s = newGame('T', 0)
    s.materials['rune_speed_1'] = 1
    s.materials['rune_efficiency_1'] = 1
    s.materials['rune_rarefind_1'] = 1
    useRune(s, 'rune_speed_1', T0)
    useRune(s, 'rune_efficiency_1', T0 + 60_000)
    expect(s.buffs.length).toBe(2)
    useRune(s, 'rune_rarefind_1', T0 + 120_000) // 替换 speed（剩余最短）
    const ids = s.buffs.map((b) => b.defId)
    expect(ids).toContain('rune_efficiency_1')
    expect(ids).toContain('rune_rarefind_1')
    expect(ids).not.toContain('rune_speed_1')
  })

  it('增益加成聚合与过期', () => {
    const s = newGame('T', 0)
    s.materials['rune_speed_1'] = 1
    s.materials['rune_rarefind_1'] = 1
    useRune(s, 'rune_speed_1', T0)
    useRune(s, 'rune_rarefind_1', T0)
    const bonus = buffBonuses(s, T0 + 1000)
    expect(bonus.speed).toBeCloseTo(0.15)
    expect(bonus.rareFind).toBeCloseTo(0.2)
    expect(buffBonuses(s, T0 + 600_001).speed).toBe(0) // 过期
  })

  it('pruneBuffs 清理过期槽位', () => {
    const s = newGame('T', 0)
    s.buffs.push({ defId: 'rune_speed_1', until: T0 - 1 })
    s.buffs.push({ defId: 'rune_speed_2', until: T0 + 1000 })
    pruneBuffs(s, T0)
    expect(s.buffs.length).toBe(1)
    expect(s.buffs[0].defId).toBe('rune_speed_2')
  })

  it('祝福符文：强化成功率 +0.03 聚合正确', () => {
    const s = newGame('T', 0)
    s.materials['rune_enhance_1'] = 1
    useRune(s, 'rune_enhance_1', T0)
    expect(buffBonuses(s, T0).enhanceRate).toBeCloseTo(0.03)
  })
})
