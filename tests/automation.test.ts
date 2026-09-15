import { describe, expect, it } from 'vitest'
import { sweepAutoRecycle } from '../src/game/automation'
import { applyCommand } from '../src/game/commands'
import { newGame } from '../src/game/state'
import type { ActiveAction, GameState } from '../src/game/types'

const NOW = 1_000_000

function withActions(s: GameState): void {
  s.actions.current = {
    ref: { kind: 'mine', siteId: 'copper_seam' },
    remaining: null,
    startedAt: 0,
    durationMs: 6000,
    procMisses: 0,
  } as ActiveAction
  s.actions.queue.push({
    ref: { kind: 'craft', recipeId: 'smelt_copper' },
    remaining: 5,
    startedAt: 0,
    durationMs: 6000,
    procMisses: 0,
  })
}

describe('自动化（v1.7）：自动回收', () => {
  it('超出保留量自动卖出并计入金币与累计', () => {
    const s = newGame('T', 0)
    s.materials['ore_copper'] = 100
    s.meta.autoRecycle['ore_copper'] = 20
    const events = sweepAutoRecycle(s)
    expect(s.materials['ore_copper']).toBe(20)
    expect(s.gold).toBe(80 * 2) // 铜矿石单价 2
    expect(s.stats.totalGoldEarned).toBe(160)
    expect(events.some((e) => e.type === 'goldGained' && e.amount === 160)).toBe(true)
  })

  it('未超阈值 / 未开启时不动作', () => {
    const s = newGame('T', 0)
    s.materials['ore_copper'] = 10
    s.meta.autoRecycle['ore_copper'] = 20
    expect(sweepAutoRecycle(s)).toHaveLength(0)
    expect(s.materials['ore_copper']).toBe(10)

    s.materials['coal'] = 50
    sweepAutoRecycle(s)
    expect(s.materials['coal']).toBe(50) // 煤未开启自动
  })

  it('保留 0 = 全部卖出', () => {
    const s = newGame('T', 0)
    s.materials['essence'] = 5
    s.meta.autoRecycle['essence'] = 0
    sweepAutoRecycle(s)
    expect(s.materials['essence']).toBeUndefined()
    expect(s.gold).toBe(5 * 15)
  })

  it('命令：开启/关闭（null）与非法物品阻塞', () => {
    const s = newGame('T', 0)
    applyCommand(s, { type: 'setAutoRecycle', itemId: 'ore_copper', keep: 30 }, NOW)
    expect(s.meta.autoRecycle['ore_copper']).toBe(30)
    applyCommand(s, { type: 'setAutoRecycle', itemId: 'ore_copper', keep: null }, NOW)
    expect(s.meta.autoRecycle['ore_copper']).toBeUndefined()
    const ev = applyCommand(s, { type: 'setAutoRecycle', itemId: 'pick_copper', keep: 0 }, NOW)
    expect(ev.some((e) => e.type === 'blocked')).toBe(true) // 装备（非堆叠）不支持
  })
})

describe('自动化（v1.7）：动作预设', () => {
  it('保存当前动作 + 队列为预设', () => {
    const s = newGame('T', 0)
    withActions(s)
    applyCommand(s, { type: 'saveLoadout', name: '铜线' }, NOW)
    expect(s.meta.loadouts).toHaveLength(1)
    expect(s.meta.loadouts[0].name).toBe('铜线')
    expect(s.meta.loadouts[0].actions).toHaveLength(2)
    expect(s.meta.loadouts[0].actions[1]).toMatchObject({ count: 5 })
  })

  it('空动作时保存被阻塞', () => {
    const s = newGame('T', 0)
    const ev = applyCommand(s, { type: 'saveLoadout', name: 'X' }, NOW)
    expect(ev.some((e) => e.type === 'blocked')).toBe(true)
  })

  it('应用预设：合法动作恢复；非法动作跳过并提示', () => {
    const s = newGame('T', 0)
    withActions(s)
    applyCommand(s, { type: 'saveLoadout', name: 'P' }, NOW)
    s.actions.current = null
    s.actions.queue = []
    s.materials['ore_copper'] = 10 // 让 smelt_copper 合法
    s.meta.loadouts[0].actions.push({ ref: { kind: 'craft', recipeId: 'forge_sword_copper' }, count: 1 }) // 铜锭不足

    const ev = applyCommand(s, { type: 'applyLoadout', loadoutId: s.meta.loadouts[0].id }, NOW)
    expect(ev.some((e) => e.type === 'loadoutApplied')).toBe(true)
    expect(s.actions.current!.ref).toEqual({ kind: 'mine', siteId: 'copper_seam' })
    expect(s.actions.queue).toHaveLength(1)
    expect(s.actions.queue[0].ref).toEqual({ kind: 'craft', recipeId: 'smelt_copper' })
    expect(ev.some((e) => e.type === 'blocked' && e.reason.includes('已跳过'))).toBe(true)
  })

  it('预设超出队列位时截断并提示', () => {
    const s = newGame('T', 0) // queueSlots = 1
    withActions(s)
    applyCommand(s, { type: 'saveLoadout', name: 'P' }, NOW)
    s.meta.loadouts[0].actions.push({ ref: { kind: 'mine', siteId: 'copper_seam' }, count: 1 })
    s.materials['ore_copper'] = 10

    const ev = applyCommand(s, { type: 'applyLoadout', loadoutId: s.meta.loadouts[0].id }, NOW)
    expect(s.actions.queue).toHaveLength(1)
    expect(ev.some((e) => e.type === 'blocked' && e.reason.includes('队列已满'))).toBe(true)
  })

  it('删除预设与异常分支', () => {
    const s = newGame('T', 0)
    withActions(s)
    applyCommand(s, { type: 'saveLoadout', name: 'P' }, NOW)
    const id = s.meta.loadouts[0].id
    applyCommand(s, { type: 'deleteLoadout', loadoutId: id }, NOW)
    expect(s.meta.loadouts).toHaveLength(0)

    expect(
      applyCommand(s, { type: 'deleteLoadout', loadoutId: id }, NOW).some((e) => e.type === 'blocked'),
    ).toBe(true)
    expect(
      applyCommand(s, { type: 'applyLoadout', loadoutId: 'nope' }, NOW).some((e) => e.type === 'blocked'),
    ).toBe(true)
  })
})
