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

/** 基础属性用例：清空词缀，避免随机词缀干扰断言（词缀另有专项测试） */
function equip(s: GameState, itemId: string, enhanceLevel = 0): number {
  const id = addInstance(s, itemId, enhanceLevel)
  s.equipment.find((e) => e.instanceId === id)!.affixes = []
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
  it('队列推进：当前结束后自动执行队首（Lv1 可玩动作）', () => {
    const s = newGame('T', 0)
    startCurrent(s, { kind: 'mine', siteId: 'copper_seam' }, 1)
    enqueue(s, { kind: 'mine', siteId: 'copper_seam' }, 1)
    const events = simulate(s, 60_000, { mode: 'online', rng: mulberry32(42) })
    // v3.7.18：原用例用铁矿脉（需 Lv10）——"入队绕过等级检查后仍执行"是隐藏漏洞，
    // 预检已堵住；改用 Lv1 的铜矿脉，按语义断言（startCurrent 是测试 helper，不发
    // actionStarted 事件；该事件只由队列推进发出）
    expect(events.some((e) => e.type === 'actionStarted'), '队列项启动过').toBe(true)
    expect(s.stats.totalMines, '两次挖掘都结算').toBe(2)
    expect(s.actions.queue.length, '队列已消费').toBe(0)
  })

  it('队列项等级不足 → 预检跳过并提示（堵住"入队绕过等级检查"的漏洞）', () => {
    const s = newGame('T', 0)
    startCurrent(s, { kind: 'mine', siteId: 'copper_seam' }, 1)
    enqueue(s, { kind: 'mine', siteId: 'iron_seam' }, 1) // 需 Lv10，当前 Lv1
    const events = simulate(s, 60_000, { mode: 'online', rng: mulberry32(42) })
    expect(
      events.some((e) => e.type === 'blocked' && e.reason.includes('已跳过队列项')),
      '应跳过并明确提示',
    ).toBe(true)
    expect(
      events.some((e) => e.type === 'actionStarted' && e.ref.kind === 'mine' && e.ref.siteId === 'iron_seam'),
      '等级不足的动作不应执行（此前的隐藏漏洞是它会执行）',
    ).toBe(false)
    expect(s.materials['ore_iron'] ?? 0, '不应产出铁矿石').toBe(0)
  })

  it('队列项材料不足：预检跳过并提示（用户要求：移出队列而非卡住）', () => {
    const s = newGame('T', 0)
    startCurrent(s, { kind: 'mine', siteId: 'copper_seam' }, 2)
    enqueue(s, { kind: 'craft', recipeId: 'forge_pick_copper' }, 1) // 无铜锭 → 不可行
    const events = simulate(s, 120_000, { mode: 'online', rng: mulberry32(42) })
    expect(s.actions.current).toBeNull()
    expect(s.actions.queue.length, '不可行项应被移出队列').toBe(0)
    const skipped = events.filter((e) => e.type === 'blocked' && e.reason.includes('已跳过队列项'))
    expect(skipped.length, 'v3.7.18：应明确提示"已跳过"（此前静默消失）').toBe(1)
    expect(String((skipped[0] as { reason: string }).reason)).toContain('材料不足')
    expect(s.equipment.length, '锻造未发生').toBe(0)
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

  it('连续强化链：∞ 模式自动逐级重臂，+10 后自然收束（无报错）', () => {
    const s = newGame('T', 0)
    const id = equip(s, 'pick_copper')
    s.materials['ingot_copper'] = 100
    s.materials['essence'] = 100
    startCurrent(s, { kind: 'enhance', instanceId: id, targetLevel: 1 }, null) // ∞
    // rng 恒 0 → 所有成功率（0.36~1）均判定成功
    const events = simulate(s, 60_000, { mode: 'online', rng: { next: () => 0 } })
    const inst = s.equipment.find((e) => e.instanceId === id)!
    expect(inst.enhanceLevel).toBe(10) // 0 → 10 共 10 次尝试（+1~+10 各一次）
    expect(s.stats.totalEnhances).toBe(10)
    expect(s.actions.current).toBeNull() // +10 后收束，无队列残留
    expect(events.some((e) => e.type === 'blocked')).toBe(false) // 未触发“已达上限”报错
  })

  it('饰品加成（v1.3）：+10 档（36%）掷点 0.37 失败；佩戴项链（+3% → 39%）成功', () => {
    // 无项链：0.37 > 0.36 → 失败
    const a = newGame('T', 0)
    const ia = addInstance(a, 'pick_copper', 9)
    a.materials['ingot_copper'] = 100
    a.materials['essence'] = 100
    startCurrent(a, { kind: 'enhance', instanceId: ia, targetLevel: 10 }, 1)
    const evA = simulate(a, 6_000, { mode: 'online', rng: { next: () => 0.37 } })
    expect(evA.find((e) => e.type === 'enhanceResult')).toMatchObject({ success: false })

    // 佩戴秘银项链（+3%）：0.37 < 0.39 → 成功
    const b = newGame('T', 0)
    const ib = addInstance(b, 'pick_copper', 9)
    const necklace = addInstance(b, 'necklace_mithril')
    b.slots.necklace = necklace
    b.materials['ingot_copper'] = 100
    b.materials['essence'] = 100
    startCurrent(b, { kind: 'enhance', instanceId: ib, targetLevel: 10 }, 1)
    const evB = simulate(b, 6_000, { mode: 'online', rng: { next: () => 0.37 } })
    expect(evB.find((e) => e.type === 'enhanceResult')).toMatchObject({ success: true, to: 10 })
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

  it('符文制作（v1.4）：消耗精华+锭，计数与产出正确', () => {
    const s = newGame('T', 0)
    s.materials['essence'] = 3
    s.materials['ingot_copper'] = 5
    startCurrent(s, { kind: 'craft', recipeId: 'craft_rune_speed_1' }, 1)
    simulate(s, 6_000, { mode: 'online', rng: mulberry32(1) })
    expect(s.materials['rune_speed_1']).toBe(1)
    expect(s.stats.totalRunesCrafted).toBe(1)
    expect(s.materials['essence']).toBeUndefined()
    expect(s.materials['ingot_copper']).toBeUndefined()
  })

  it('祝福符文（v1.4）：强化成功率 +3% 使 0.37 掷点成功（0.36 + 0.03）', () => {
    const s = newGame('T', 0)
    const id = addInstance(s, 'pick_copper', 9)
    s.materials['ingot_copper'] = 100
    s.materials['essence'] = 100
    s.buffs.push({ defId: 'rune_enhance_1', until: Date.now() + 600_000 })
    startCurrent(s, { kind: 'enhance', instanceId: id, targetLevel: 10 }, 1)
    const ev = simulate(s, 6_000, { mode: 'online', rng: { next: () => 0.37 } })
    expect(ev.find((e) => e.type === 'enhanceResult')).toMatchObject({ success: true, to: 10 })
  })

  it('临时增益不参与离线结算（离线轮数按无 buff 计算，结算后恢复）', () => {
    const s = newGame('T', 0)
    s.buffs.push({ defId: 'rune_speed_1', until: Date.now() + 3_600_000 })
    startCurrent(s, { kind: 'mine', siteId: 'copper_seam' }, null)
    const summary = settleOffline(s, 60_000)!
    const rounds = summary.rounds.find((r) => r.ref.kind === 'mine')!.count
    expect(rounds).toBe(10) // 60s ÷ 6s；若错误应用 +15% 速度则为 ≈11
    expect(s.buffs.length).toBe(1) // 结算后 buffs 恢复
  })
})
