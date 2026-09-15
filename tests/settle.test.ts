import { describe, expect, it } from 'vitest'
import { CONTENT } from '../src/game/content'
import { settleOffline } from '../src/game/offline'
import { mulberry32 } from '../src/game/rng'
import { simulate } from '../src/game/settle'
import { addInstance, newGame } from '../src/game/state'
import { claimTutorial } from '../src/game/tutorial'
import type { ActionRef, GameState } from '../src/game/types'

function startCurrent(s: GameState, ref: ActionRef, count: number | null, at = 0): void {
  s.actions.current = { ref, remaining: count, startedAt: at, durationMs: 0, procMisses: 0 }
}

function enqueue(s: GameState, ref: ActionRef, count: number | null): void {
  s.actions.queue.push({ ref, remaining: count, startedAt: 0, durationMs: 0, procMisses: 0 })
}

function equip(s: GameState, itemId: string, enhanceLevel = 0): number {
  const id = addInstance(s, itemId, enhanceLevel)
  const def = CONTENT.items[itemId]
  if (def.slot) s.slots[def.slot] = id
  return id
}

describe('离线结算', () => {
  it('黄金用例：600s（设计 §10 示例逐行）', () => {
    const s = newGame('T', 0)
    s.materials['ore_copper'] = 100
    startCurrent(s, { kind: 'craft', recipeId: 'smelt_copper' }, 50)
    enqueue(s, { kind: 'craft', recipeId: 'forge_pick_copper' }, 3)

    const summary = settleOffline(s, 600_000)
    expect(summary).not.toBeNull()
    expect(summary!.elapsedMs).toBe(600_000)
    expect(summary!.countedMs).toBe(600_000)

    // 熔炼 50 次：消耗 100 铜矿 → 50 铜锭、XP +250
    expect(s.materials['ore_copper']).toBeUndefined()
    expect(s.skills.smelting).toBeCloseTo(250)
    // 锻造 3 次：消耗 36 铜锭 → 3 把铜镐、XP +36
    expect(s.materials['ingot_copper']).toBe(14)
    expect(s.skills.forging).toBeCloseTo(36)
    expect(s.equipment.filter((e) => e.itemId === 'pick_copper').length).toBe(3)

    // 摘要
    expect(
      summary!.rounds.find((r) => r.ref.kind === 'craft' && r.ref.recipeId === 'smelt_copper')?.count,
    ).toBe(50)
    expect(
      summary!.rounds.find((r) => r.ref.kind === 'craft' && r.ref.recipeId === 'forge_pick_copper')?.count,
    ).toBe(3)
    expect(summary!.items.find((i) => i.itemId === 'ingot_copper')?.qty).toBe(50)
    expect(summary!.items.find((i) => i.itemId === 'pick_copper')?.qty).toBe(3)
    expect(summary!.notes).toHaveLength(0)
    // 小数结转（精华 0.017 × 53 ≈ 0.90）
    expect(s.meta.carry.items['essence'] ?? 0).toBeGreaterThan(0.8)
  })

  it('cap 8h：超出部分不结算不结转', () => {
    const s = newGame('T', 0)
    startCurrent(s, { kind: 'mine', siteId: 'copper_seam' }, null)
    const summary = settleOffline(s, 10 * 3_600_000)
    expect(summary!.countedMs).toBe(8 * 3_600_000)
    expect(summary!.notes.some((n) => n.includes('上限'))).toBe(true)
    expect(s.meta.lastSeenAt).toBe(10 * 3_600_000)
    expect(s.materials['ore_copper'] ?? 0).toBeGreaterThan(9_000)
  })

  it('无动作时返回 null 并推进 lastSeenAt', () => {
    const s = newGame('T', 0)
    expect(settleOffline(s, 1000)).toBeNull()
    expect(s.meta.lastSeenAt).toBe(1000)
  })
})

describe('在线结算', () => {
  it('队列推进：当前结束后自动执行队首', () => {
    const s = newGame('T', 0)
    startCurrent(s, { kind: 'mine', siteId: 'copper_seam' }, 1)
    enqueue(s, { kind: 'mine', siteId: 'iron_seam' }, null)
    const events = simulate(s, 60_000, { mode: 'online', rng: mulberry32(42) })
    expect(events.some((e) => e.type === 'actionStarted' && e.ref.kind === 'mine' && e.ref.siteId === 'iron_seam')).toBe(true)
    // 铁矿产出了铁矿石
    expect(s.materials['ore_iron'] ?? 0).toBeGreaterThan(0)
  })

  it('材料不足：阻塞停止并发出事件，队列不自动跳过', () => {
    const s = newGame('T', 0)
    startCurrent(s, { kind: 'mine', siteId: 'copper_seam' }, 2)
    enqueue(s, { kind: 'craft', recipeId: 'forge_pick_copper' }, 1) // 无铜锭 → 阻塞
    const events = simulate(s, 120_000, { mode: 'online', rng: mulberry32(42) })
    expect(s.actions.current).toBeNull()
    expect(s.actions.queue.length).toBe(0)
    expect(events.some((e) => e.type === 'blocked' && e.reason.includes('材料不足'))).toBe(true)
    expect(events.some((e) => e.type === 'actionStopped' && e.reason === 'noMaterials')).toBe(true)
    expect(s.equipment.length).toBe(0)
  })

  it('效率保底：E=12% 时每 9 轮必触发一次（rng 固定 0.99 不随机触发）', () => {
    const s = newGame('T', 0)
    equip(s, 'sword_mithril', 10) // efficiency = 0.08 × 1.5 = 0.12
    startCurrent(s, { kind: 'mine', siteId: 'copper_seam' }, 100)
    const rng = { next: () => 0.99 }
    simulate(s, 600_000, { mode: 'online', rng })
    // 100 轮基础 + 保底 11 次（第 9/18/…/99 轮）；randInt(0.99) 恒取上限 3
    expect(s.materials['ore_copper']).toBe(333)
    expect(s.skills.mining).toBeCloseTo(555) // 5 × 111
  })

  it('强化动作：+1 必成（100%），成功 XP ×2，消耗同级锭 + 精华', () => {
    const s = newGame('T', 0)
    const id = equip(s, 'pick_copper')
    s.materials['ingot_copper'] = 2
    s.materials['essence'] = 1
    startCurrent(s, { kind: 'enhance', instanceId: id, targetLevel: 1 }, 1)
    const events = simulate(s, 6_000, { mode: 'online', rng: mulberry32(1) })
    expect(s.equipment.find((e) => e.instanceId === id)!.enhanceLevel).toBe(1)
    expect(s.materials['ingot_copper']).toBeUndefined()
    expect(s.materials['essence']).toBeUndefined()
    expect(s.skills.enhancing).toBe(14)
    expect(s.stats.totalEnhances).toBe(1)
    expect(events.find((e) => e.type === 'enhanceResult')).toMatchObject({ success: true, from: 0, to: 1 })
  })

  it('教程步骤 1 达成 + 升级事件 + 领取奖励', () => {
    const s = newGame('T', 0)
    startCurrent(s, { kind: 'mine', siteId: 'copper_seam' }, 10)
    const events = simulate(s, 120_000, { mode: 'online', rng: mulberry32(7) })
    expect(s.skills.mining).toBeGreaterThanOrEqual(50)
    expect(events.some((e) => e.type === 'levelUp')).toBe(true)
    expect(s.flags.tutorial.completed).toContain(1)
    expect(events.some((e) => e.type === 'tutorialGoalMet')).toBe(true)

    const claimEvents = claimTutorial(s, 1)
    expect(s.gold).toBe(20)
    expect(s.flags.tutorial.current).toBe(2)
    expect(claimEvents.some((e) => e.type === 'tutorialRewarded')).toBe(true)
  })

  it('领奖后新步骤条件已满足时立即判定（总等级类目标）', () => {
    const s = newGame('T', 0)
    s.skills.mining = 2000 // 足够高的总等级
    s.flags.tutorial.current = 8
    s.flags.tutorial.completed = [7]
    const events = claimTutorial(s, 7)
    expect(s.flags.tutorial.completed).toContain(8)
    expect(events.some((e) => e.type === 'tutorialGoalMet' && e.step === 8)).toBe(true)

    const claim8 = claimTutorial(s, 8)
    expect(s.queueSlots).toBe(2) // 第 8 步奖励：队列位 +1
    expect(claim8.some((e) => e.type === 'tutorialRewarded' && e.step === 8)).toBe(true)
    expect(s.flags.tutorial.current).toBe(9)
  })
})
