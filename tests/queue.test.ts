// @vitest-environment node
// 队列推进回归（v3.7.17 修复：current 为空而队列非空时自动启动首项）
// 起因：用户报告「两个队列，第一个执行完第二个不执行」——停止/阻塞后队列卡死（场景 6/7）
import { describe, expect, it } from 'vitest'
import { applyCommand } from '../src/game/commands'
import { simulate } from '../src/game/settle'
import { newGame } from '../src/game/state'
import { mulberry32 } from '../src/game/rng'
import type { ActionRef, Command, GameEvent, GameState } from '../src/game/types'

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
