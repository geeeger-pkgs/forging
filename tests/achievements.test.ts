import { describe, expect, it } from 'vitest'
import { achievementProgress, checkAchievements } from '../src/game/achievements'
import { mulberry32 } from '../src/game/rng'
import { simulate } from '../src/game/settle'
import { addInstance, newGame } from '../src/game/state'
import type { ActionRef, GameState, SlotId } from '../src/game/types'

function startCurrent(s: GameState, ref: ActionRef, count: number | null): void {
  s.actions.current = { ref, remaining: count, startedAt: 0, durationMs: 0, procMisses: 0 }
}

describe('成就系统', () => {
  it('挖矿计数成就解锁并发放奖励（幂等）', () => {
    const s = newGame('T', 0)
    startCurrent(s, { kind: 'mine', siteId: 'copper_seam' }, 10)
    simulate(s, 120_000, { mode: 'online', rng: mulberry32(3) })
    expect(s.stats.totalMines).toBe(10)

    const events = checkAchievements(s)
    expect(s.flags.achievements.unlocked).toContain('mine_10')
    expect(events.some((e) => e.type === 'achievementUnlocked' && e.id === 'mine_10')).toBe(true)
    expect(s.gold).toBeGreaterThanOrEqual(20)

    const goldAfter = s.gold
    checkAchievements(s)
    expect(s.gold).toBe(goldAfter) // 幂等：不重复发奖
  })

  it('技能等级成就：挖掘达到 Lv10', () => {
    const s = newGame('T', 0)
    s.skills.mining = 1193 // 恰好 Lv10
    checkAchievements(s)
    expect(s.flags.achievements.unlocked).toContain('mining_10')
    expect(s.flags.achievements.unlocked).not.toContain('mining_20')
  })

  it('强化等级成就：+5 解锁，累计强化另有计数', () => {
    const s = newGame('T', 0)
    const id = addInstance(s, 'pick_copper', 5)
    expect(id).toBe(1)
    s.stats.totalEnhances = 1
    checkAchievements(s)
    expect(s.flags.achievements.unlocked).toContain('plus5')
    expect(s.flags.achievements.unlocked).toContain('enh_1')
    expect(s.flags.achievements.unlocked).not.toContain('plus10')
  })

  it('物品数量与总价值成就（含跨阈值）', () => {
    const s = newGame('T', 0)
    s.materials['essence'] = 10
    s.materials['ore_copper'] = 100 // 150 + 200 = 350
    checkAchievements(s)
    expect(s.flags.achievements.unlocked).toContain('item_essence_10')
    expect(s.flags.achievements.unlocked).not.toContain('value_1000')

    s.materials['ingot_mithril'] = 20 // +2500 → 2850
    checkAchievements(s)
    expect(s.flags.achievements.unlocked).toContain('value_1000')
    expect(s.flags.achievements.unlocked).toContain('item_mithril_1')
    expect(s.flags.achievements.unlocked).not.toContain('value_10000')
  })

  it('成就进度统计', () => {
    const s = newGame('T', 0)
    const p = achievementProgress(s)
    expect(p.total).toBeGreaterThanOrEqual(38)
    expect(p.unlocked).toBe(0)
  })

  it('槽位成就（v1.3）：填满 8 槽解锁「八面玲珑」，10 槽解锁「十全十美」', () => {
    const s = newGame('T', 0)
    const order: SlotId[] = ['pick', 'crucible', 'hammer', 'mainHand', 'head', 'body', 'legs', 'feet']
    const items = [
      'pick_copper',
      'crucible_copper',
      'hammer_copper',
      'sword_copper',
      'helmet_copper',
      'chest_copper',
      'legs_copper',
      'boots_copper',
    ]
    items.forEach((itemId, i) => {
      s.slots[order[i]] = addInstance(s, itemId)
    })
    checkAchievements(s)
    expect(s.flags.achievements.unlocked).toContain('slots_8')
    expect(s.flags.achievements.unlocked).not.toContain('slots_10')

    s.slots.necklace = addInstance(s, 'necklace_copper')
    s.slots.ring = addInstance(s, 'ring_copper')
    checkAchievements(s)
    expect(s.flags.achievements.unlocked).toContain('slots_10')
  })

  it('符文成就（v1.4）：双符共鸣（buffSlots ≥ 2）', () => {
    const s = newGame('T', 0)
    s.buffs.push({ defId: 'rune_speed_1', until: Date.now() + 600_000 })
    checkAchievements(s)
    expect(s.flags.achievements.unlocked).not.toContain('rune_both')

    s.buffs.push({ defId: 'rune_rarefind_1', until: Date.now() + 600_000 })
    checkAchievements(s)
    expect(s.flags.achievements.unlocked).toContain('rune_both')
  })
})
