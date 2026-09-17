// @vitest-environment node
// 队列推进回归（v3.7.17 修复：current 为空而队列非空时自动启动首项）
// 起因：用户报告「两个队列，第一个执行完第二个不执行」——停止/阻塞后队列卡死（场景 6/7）
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { applyCommand } from '../src/game/commands'
import { settleOffline } from '../src/game/offline'
import { simulate } from '../src/game/settle'
import { addInstance, newGame } from '../src/game/state'
import { mulberry32 } from '../src/game/rng'
import type { ActionRef, Command, GameEvent, GameState } from '../src/game/types'

/** 造一件可强化的镐（+0，槽位已装备） */
function equipPick(s: GameState): number {
  const id = addInstance(s, 'pick_copper')
  s.equipment.find((e) => e.instanceId === id)!.affixes = []
  s.slots.pick = id
  return id
}

/** 简化包装：now 固定为 0（命令不受墙钟影响，除了写 lastSeenAt） */
const performCommand = (s: GameState, c: Command): GameEvent[] => applyCommand(s, c, 0)

const A: ActionRef = { kind: 'mine', siteId: 'copper_seam' }
const B: ActionRef = { kind: 'mine', siteId: 'copper_seam' }

function boot() {
  const s = newGame('T', 0)
  return s
}

describe('队列推进复现', () => {
  it('场景 1：A(×1) 立即开始 + B 入队 → A 完成后 B 应自动执行', () => {
    const s = boot()
    performCommand(s, { type: 'startAction', ref: A, count: 1, mode: 'now' })
    const ev = performCommand(s, { type: 'startAction', ref: B, count: 1, mode: 'enqueue' })
    expect(ev.some((e) => e.type === 'notice'), '入队应有反馈').toBe(true)
    expect(s.actions.queue.length).toBe(1)

    simulate(s, 7_000, { mode: 'online', rng: mulberry32(1) })
    expect(s.actions.current, 'A 完成后 B 应该成为当前动作').not.toBeNull()
    expect(s.actions.queue.length, '队列应已清空').toBe(0)
    expect(s.actions.current!.ref).toEqual(B)

    simulate(s, 14_000, { mode: 'online', rng: mulberry32(2) })
    expect(s.actions.current, 'B 完成后应空闲').toBeNull()
  })

  it('场景 2：A(×2) + B 入队（A 跑两轮后交棒）', () => {
    const s = boot()
    performCommand(s, { type: 'startAction', ref: A, count: 2, mode: 'now' })
    performCommand(s, { type: 'startAction', ref: B, count: 1, mode: 'enqueue' })
    simulate(s, 6_100, { mode: 'online', rng: mulberry32(1) })
    expect(s.actions.current, '第 1 轮后仍在 A').not.toBeNull()
    expect(s.actions.current!.remaining).toBe(1)
    simulate(s, 12_100, { mode: 'online', rng: mulberry32(2) })
    expect(s.actions.current, 'A 两轮完成后 B 应接手').not.toBeNull()
    expect(s.actions.current!.ref).toEqual(B)
  })

  it('场景 3：弹性大跨度 simulate（离线式一次推进 30 分钟，跨多个队列项）', () => {
    const s = boot()
    performCommand(s, { type: 'startAction', ref: A, count: 1, mode: 'now' })
    performCommand(s, { type: 'startAction', ref: B, count: 1, mode: 'enqueue' })
    simulate(s, 30 * 60_000, { mode: 'expectation' })
    expect(s.actions.current, 'expectation 模式：A+B 都应完成，当前为空').toBeNull()
    expect(s.actions.queue.length, '队列应已耗尽').toBe(0)
    // 两轮产出：A 3 个 + B 3 个（expectation 下铜矿脉 1~3 取期望 2？此处只验证都跑了）
    expect(s.stats.totalMines, '两次动作都应结算').toBeGreaterThanOrEqual(2)
  })

  it('场景 4：连续 simulate 分片推进（模拟 tick 250ms 多次调用）', () => {
    const s = boot()
    performCommand(s, { type: 'startAction', ref: A, count: 1, mode: 'now' })
    performCommand(s, { type: 'startAction', ref: B, count: 1, mode: 'enqueue' })
    for (let t = 250; t <= 14_000; t += 250) {
      simulate(s, t, { mode: 'online', rng: mulberry32(t) })
    }
    expect(s.actions.current, '分片推进下 B 也应完成').toBeNull()
    expect(s.stats.totalMines, '两次动作都应结算').toBeGreaterThanOrEqual(2)
  })

  it('场景 6：A 运行中玩家点「停止」→ 队列里的 B 应接上', () => {
    const s = boot()
    performCommand(s, { type: 'startAction', ref: A, count: null, mode: 'now' }) // ∞ 长动作
    performCommand(s, { type: 'startAction', ref: B, count: 1, mode: 'enqueue' })
    simulate(s, 3_000, { mode: 'online', rng: mulberry32(1) })
    expect(s.actions.current, 'A 在跑').not.toBeNull()
    // 玩家主动停止 A（模拟 UI 的停止按钮）
    applyCommand(s, { type: 'stopAction' }, 3_000)
    expect(s.actions.current, '停止后 current 为空').toBeNull()
    // 下一个 tick 队列应接上（先看"接上"，再看"跑完"）
    simulate(s, 3_500, { mode: 'online', rng: mulberry32(2) })
    expect(s.actions.current, 'B 应接上（当前动作非空）').not.toBeNull()
    simulate(s, 20_000, { mode: 'online', rng: mulberry32(3) })
    // A 在 3s 被停止（6s 一轮，未跑完任何轮）→ 只有 B 的 1 轮
    expect(s.stats.totalMines, 'B 恰好结算 1 轮').toBe(1)
    expect(s.actions.queue.length).toBe(0)
    expect(s.actions.current, 'B 完成后空闲').toBeNull()
  })

  it('场景 7：A 因材料不足阻塞停止 → 队列里不依赖材料的 B 应接上（tick 驱动）', () => {
    const s = boot()
    // A = 熔炼铜锭（每轮消耗铜矿石 ×2）：给够 1 轮、第 2 轮中途耗尽 → performRound 阻塞
    // （注意 ActionRef 只有 mine/craft/enhance 三种；熔炼与锻造同属 craft，由 recipeId 决定技能）
    s.materials['ore_copper'] = 3
    const smelt: ActionRef = { kind: 'craft', recipeId: 'smelt_copper' }
    performCommand(s, { type: 'startAction', ref: smelt, count: 3, mode: 'now' })
    performCommand(s, { type: 'startAction', ref: B, count: 1, mode: 'enqueue' })
    // 真实驱动：250ms tick（A 第 2 轮材料不足被阻塞停下，之后 B 应被接上）
    for (let t = 1_000; t <= 60_000; t += 250) {
      simulate(s, t, { mode: 'online', rng: mulberry32(t) })
    }
    expect(s.stats.totalSmelts, 'A 跑了 1 轮后因材料不足被阻塞').toBe(1)
    expect(s.stats.totalMines, 'B 应被结算（挖掘不需要材料）').toBeGreaterThanOrEqual(1)
    expect(s.actions.queue.length, '队列应被消费').toBe(0)
  })

  it('场景 8：队列项材料不足 → 移出队列并明确提示（预检拦截，不启动不卡住）', () => {
    const s = boot()
    // A = 熔炼（给 2 个矿石，刚好 1 轮）；队列：锻造铜镐（需铜锭 ×12，不可行）→ 挖掘（可行）
    s.materials['ore_copper'] = 2
    const smelt: ActionRef = { kind: 'craft', recipeId: 'smelt_copper' }
    performCommand(s, { type: 'startAction', ref: smelt, count: 1, mode: 'now' })
    s.queueSlots = 2
    const forge: ActionRef = { kind: 'craft', recipeId: 'forge_pick_copper' }
    s.actions.queue.push({ ref: forge, remaining: 1, startedAt: 0, durationMs: 6_000, procMisses: 0 })
    performCommand(s, { type: 'startAction', ref: B, count: 1, mode: 'enqueue' })
    expect(s.actions.queue.length, '队列应有 2 项').toBe(2)

    const all: GameEvent[] = []
    for (let t = 1_000; t <= 20_000; t += 250) {
      simulate(s, t, { mode: 'online', rng: mulberry32(t), events: all })
    }
    const skipped = all.filter(
      (e) => e.type === 'blocked' && String((e as { reason?: string }).reason ?? '').includes('已跳过队列项'),
    )
    expect(skipped.length, '应有「已跳过队列项」提示（不静默消失）').toBe(1)
    expect(String((skipped[0] as { reason: string }).reason), '提示应说明原因').toContain('材料不足')
    expect(
      all.some(
        (e) =>
          e.type === 'actionStarted' && JSON.stringify((e as { ref?: unknown }).ref ?? '').includes('forge_pick_copper'),
      ),
      '不可行项不应被启动（预检在启动前拦截，避免闪一下又停）',
    ).toBe(false)
    expect(s.stats.totalMines, '后续可行项（挖掘）照常执行').toBeGreaterThanOrEqual(1)
    expect(s.actions.queue.length, '队列应清空').toBe(0)
  })

  it('场景 9：队列里的强化（enhance）可行 → 正常执行（三类动作全覆：mine/craft/enhance）', () => {
    const s = boot()
    const id = equipPick(s)
    s.materials['ingot_copper'] = 2
    s.materials['essence'] = 1
    performCommand(s, { type: 'startAction', ref: A, count: 1, mode: 'now' }) // 占住 current
    const enq = performCommand(s, {
      type: 'startAction',
      ref: { kind: 'enhance', instanceId: id, targetLevel: 1 },
      count: 1,
      mode: 'enqueue',
    })
    expect(enq.some((e) => e.type === 'notice'), '材料齐 → 强化应能入队').toBe(true)
    for (let t = 1_000; t <= 30_000; t += 250) simulate(s, t, { mode: 'online', rng: mulberry32(t) })
    expect(s.equipment.find((e) => e.instanceId === id)!.enhanceLevel, '队列里的强化应被执行到 +1').toBe(1)
    expect(s.actions.queue.length).toBe(0)
  })

  it('场景 10：队列里的强化不可行（入队后材料被消耗）→ 跳过并提示', () => {
    const s = boot()
    const id = equipPick(s)
    s.materials['ingot_copper'] = 2
    s.materials['essence'] = 1
    performCommand(s, { type: 'startAction', ref: A, count: 1, mode: 'now' })
    performCommand(s, {
      type: 'startAction',
      ref: { kind: 'enhance', instanceId: id, targetLevel: 1 },
      count: 1,
      mode: 'enqueue',
    })
    expect(s.actions.queue.length, '材料齐时入队成功').toBe(1)
    // 入队后材料被消耗（其他动作/手动操作）
    s.materials['ingot_copper'] = 0
    s.materials['essence'] = 0
    const all: GameEvent[] = []
    for (let t = 1_000; t <= 30_000; t += 250) simulate(s, t, { mode: 'online', rng: mulberry32(t), events: all })
    const skipped = all.filter(
      (e) => e.type === 'blocked' && String((e as { reason?: string }).reason ?? '').includes('已跳过队列项'),
    )
    expect(skipped.length, '强化项应被跳过并提示').toBe(1)
    expect(String((skipped[0] as { reason: string }).reason), '原因应为材料不足').toContain('材料不足')
    expect(s.equipment.find((e) => e.instanceId === id)!.enhanceLevel, '强化未发生').toBe(0)
    expect(s.actions.queue.length).toBe(0)
  })

  it('场景 11：离线结算会过滤队列中的强化项（既有规则，一并锁定）', () => {
    const s = boot()
    const id = equipPick(s)
    s.materials['ingot_copper'] = 2
    s.materials['essence'] = 1
    performCommand(s, { type: 'startAction', ref: A, count: null, mode: 'now' }) // ∞ 占住
    performCommand(s, {
      type: 'startAction',
      ref: { kind: 'enhance', instanceId: id, targetLevel: 1 },
      count: 1,
      mode: 'enqueue',
    })
    expect(s.actions.queue.some((a) => a.ref.kind === 'enhance'), '入队的是强化项').toBe(true)
    const summary = settleOffline(s, 8 * 3_600_000)
    expect(summary, '离线应结算').not.toBeNull()
    expect(s.actions.queue.some((a) => a.ref.kind === 'enhance'), '离线结算后队列里不应再有强化项').toBe(false)
    expect(
      (summary!.notes ?? []).some((n) => n.includes('强化')),
      '应有"强化不参与离线"的说明',
    ).toBe(true)
  })

  it('describe.canQueue 三态：无阻塞 ✔ / 软阻塞 ✔（可预排）/ 硬阻塞 ✘ —— UI 按钮的数据源', async () => {
    // v3.7.21：初版 canQueue 判定写反，导致"内核已放行、UI 仍禁用按钮"（用户实测发现）。
    // 本用例锁 UI 数据源；ActionDialog 的按钮绑定另有源码契约断言。
    const { describeAction } = await import('../src/app/describe')
    const s = newGame('T', 0)
    expect(describeAction(s, { kind: 'mine', siteId: 'copper_seam' }, 0).canQueue, '无阻塞：可入队').toBe(true)
    const smelt = describeAction(s, { kind: 'craft', recipeId: 'smelt_copper' }, 0)
    expect(smelt.blockReason, '无矿石 → 材料不足').toContain('材料不足')
    expect(smelt.canStart, '「开始」仍需材料（不变）').toBe(false)
    expect(smelt.canQueue, '软阻塞：「加入队列」应可点').toBe(true)
    const iron = describeAction(s, { kind: 'mine', siteId: 'iron_seam' }, 0)
    expect(iron.blockReason, 'Lv1 → 等级不足').toContain('Lv')
    expect(iron.canQueue, '硬阻塞：不可入队').toBe(false)
  })

  it('ActionDialog 的「加入队列」按 canQueue 启用（源码契约）', () => {
    const src = readFileSync(join(process.cwd(), 'src/ui/components/ActionDialog.vue'), 'utf8')
    expect(src, '按钮应绑定 canQueue').toContain(':disabled="!desc.canQueue || queueFull"')
    expect(src, '软阻塞提示应说明可入队').toContain('可先加入队列，轮到时会自动尝试')
  })

  it('场景 12（用户验收场景）：无材料预排「挖掘×1 → 熔炼×10 → 锻造×1」，离线 10 分钟后上线', () => {
    const s = boot()
    s.materials = {} // 背包无任何材料
    s.queueSlots = 2
    performCommand(s, { type: 'startAction', ref: A, count: 1, mode: 'now' })
    const e2 = performCommand(s, {
      type: 'startAction',
      ref: { kind: 'craft', recipeId: 'smelt_copper' },
      count: 10,
      mode: 'enqueue',
    })
    const e3 = performCommand(s, {
      type: 'startAction',
      ref: { kind: 'craft', recipeId: 'forge_pick_copper' },
      count: 1,
      mode: 'enqueue',
    })
    // v3.7.20：材料不足是"软阻塞"——可预排入队（轮到时自动尝试，仍不足则跳过）
    expect(
      e2.some((e) => e.type === 'notice' && String((e as { text: string }).text).includes('自动尝试')),
      '熔炼（材料不足）可预排',
    ).toBe(true)
    expect(e3.some((e) => e.type === 'notice'), '锻造（材料不足）可预排').toBe(true)
    expect(s.actions.queue.length, '两项都在队列里').toBe(2)

    // 离线 10 分钟后上线
    const summary = settleOffline(s, 600_000)
    expect(summary, '离线应结算').not.toBeNull()
    // 预期：挖掘 ×1 完成；熔炼靠挖掘产出恰好跑 1 轮（离线期望产出 2 矿石）；
    //       锻造（需 12 铜锭）不可行 → 跳过；队列处理完毕
    expect(s.stats.totalMines, '挖掘 ×1 完成').toBe(1)
    expect(s.stats.totalSmelts, '熔炼：挖掘产出恰好够 1 轮（若有材料就正常跑，没有才跳过）').toBe(1)
    expect(s.stats.totalForges, '锻造：12 铜锭不可能满足 → 未执行').toBe(0)
    expect(s.actions.queue.length, '队列在同一次离线结算内处理完毕').toBe(0)
    expect(s.actions.current, '无残留当前动作').toBeNull()
    expect(
      summary!.notes.some((n) => n.includes('已跳过队列项')),
      '跳过有明确说明（显示在离线结算弹窗里）',
    ).toBe(true)
  })

  it('场景 13（用户要求）：调整队列顺序——置底/置顶/上移/下移', () => {
    const s = boot()
    s.queueSlots = 3
    performCommand(s, { type: 'startAction', ref: A, count: null, mode: 'now' }) // ∞ 占住 current
    performCommand(s, {
      type: 'startAction',
      ref: { kind: 'craft', recipeId: 'smelt_copper' },
      count: 1,
      mode: 'enqueue',
    })
    performCommand(s, {
      type: 'startAction',
      ref: { kind: 'craft', recipeId: 'forge_pick_copper' },
      count: 1,
      mode: 'enqueue',
    })
    performCommand(s, { type: 'startAction', ref: B, count: 1, mode: 'enqueue' })
    const tag = (q: { ref: ActionRef }): string => (q.ref.kind === 'craft' ? q.ref.recipeId : q.ref.kind)
    const order = (): string[] => s.actions.queue.map(tag)
    expect(order(), '初始顺序').toEqual(['smelt_copper', 'forge_pick_copper', 'mine'])

    performCommand(s, { type: 'moveQueueItem', from: 0, to: 2 })
    expect(order(), '置底').toEqual(['forge_pick_copper', 'mine', 'smelt_copper'])
    performCommand(s, { type: 'moveQueueItem', from: 2, to: 0 })
    expect(order(), '置顶').toEqual(['smelt_copper', 'forge_pick_copper', 'mine'])
    performCommand(s, { type: 'moveQueueItem', from: 2, to: 1 })
    expect(order(), '上移').toEqual(['smelt_copper', 'mine', 'forge_pick_copper'])
    performCommand(s, { type: 'moveQueueItem', from: 0, to: 1 })
    expect(order(), '下移').toEqual(['mine', 'smelt_copper', 'forge_pick_copper'])
  })

  it('场景 14：非法移动静默忽略（越界 / 原位 / 非整数）', () => {
    const s = boot()
    s.queueSlots = 2
    performCommand(s, { type: 'startAction', ref: A, count: null, mode: 'now' })
    performCommand(s, { type: 'startAction', ref: B, count: 1, mode: 'enqueue' })
    performCommand(s, { type: 'startAction', ref: B, count: 1, mode: 'enqueue' })
    const before = JSON.stringify(s.actions.queue)
    performCommand(s, { type: 'moveQueueItem', from: 0, to: 0 })
    performCommand(s, { type: 'moveQueueItem', from: -1, to: 1 })
    performCommand(s, { type: 'moveQueueItem', from: 0, to: 9 })
    performCommand(s, { type: 'moveQueueItem', from: 0.5, to: 1 })
    expect(JSON.stringify(s.actions.queue), '非法移动不应改动队列').toBe(before)
  })

  it('场景 15：调整后按新顺序执行（对照实验：顺序真的影响执行，不只是显示）', () => {
    // 两项都可行（给 2 矿石让熔炼可行）→ 用"谁先启动"证明顺序生效
    const run = (swap: boolean): string[] => {
      const s = boot()
      s.queueSlots = 2
      s.materials['ore_copper'] = 2
      performCommand(s, { type: 'startAction', ref: A, count: null, mode: 'now' }) // ∞ 占住
      performCommand(s, {
        type: 'startAction',
        ref: { kind: 'craft', recipeId: 'smelt_copper' },
        count: 1,
        mode: 'enqueue',
      })
      performCommand(s, { type: 'startAction', ref: B, count: 1, mode: 'enqueue' })
      if (swap) performCommand(s, { type: 'moveQueueItem', from: 0, to: 1 }) // 熔炼置底
      applyCommand(s, { type: 'stopAction' }, 0)
      const all: GameEvent[] = []
      for (let t = 500; t <= 20_000; t += 250) {
        simulate(s, t, { mode: 'online', rng: mulberry32(t), events: all })
      }
      return all
        .filter((e) => e.type === 'actionStarted')
        .map((e) => ((e as { ref: ActionRef }).ref.kind === 'craft' ? 'smelt' : 'mine'))
    }
    expect(run(false), '未调整：熔炼（队首）先执行').toEqual(['smelt', 'mine'])
    expect(run(true), '熔炼置底后：挖掘先执行（顺序生效）').toEqual(['mine', 'smelt'])
  })

  it('场景 5：队列里有 2 项（两个队列位）', () => {
    const s = boot()
    s.queueSlots = 2
    performCommand(s, { type: 'startAction', ref: A, count: 1, mode: 'now' })
    performCommand(s, { type: 'startAction', ref: B, count: 1, mode: 'enqueue' })
    performCommand(s, { type: 'startAction', ref: B, count: 1, mode: 'enqueue' })
    expect(s.actions.queue.length).toBe(2)
    simulate(s, 20_000, { mode: 'online', rng: mulberry32(1) })
    expect(s.actions.current, '三项都应完成').toBeNull()
    expect(s.stats.totalMines).toBeGreaterThanOrEqual(3)
  })
})
