import { describe, expect, it } from 'vitest'
import { applyCommand, dispatch } from '../src/game/commands'
import { mulberry32 } from '../src/game/rng'
import { addInstance, materialCount, newGame } from '../src/game/state'

describe('命令层', () => {
  it('startAction：开始挖矿，dispatch 先结算已流逝时间', () => {
    const s = newGame('T', 0)
    const ev = applyCommand(
      s,
      { type: 'startAction', ref: { kind: 'mine', siteId: 'copper_seam' }, count: 2, mode: 'now' },
      0,
    )
    expect(ev.some((e) => e.type === 'actionStarted')).toBe(true)
    expect(s.actions.current!.durationMs).toBe(6000)

    const events = dispatch(s, { type: 'stopAction' }, 12_000, mulberry32(3))
    expect(materialCount(s, 'ore_copper')).toBeGreaterThanOrEqual(2)
    expect(s.actions.current).toBeNull()
    expect(events.some((e) => e.type === 'actionCompleted')).toBe(true)
  })

  it('enqueue：空闲时等价立即开始；忙碌时追加队尾；队列满则阻塞', () => {
    const s = newGame('T', 0)
    applyCommand(s, { type: 'startAction', ref: { kind: 'mine', siteId: 'copper_seam' }, count: null, mode: 'enqueue' }, 0)
    expect(s.actions.current).not.toBeNull()
    expect(s.actions.queue.length).toBe(0)

    s.queueSlots = 1
    const ev1 = applyCommand(s, { type: 'startAction', ref: { kind: 'mine', siteId: 'copper_seam' }, count: 1, mode: 'enqueue' }, 0)
    // v3.1：入队成功会给出 notice 反馈（此前静默），但不发 actionStarted
    expect(ev1.filter((e) => e.type === 'actionStarted')).toHaveLength(0)
    expect(ev1.some((e) => e.type === 'notice')).toBe(true)
    expect(s.actions.queue.length).toBe(1)

    const ev2 = applyCommand(s, { type: 'startAction', ref: { kind: 'mine', siteId: 'copper_seam' }, count: 1, mode: 'enqueue' }, 0)
    expect(ev2.some((e) => e.type === 'blocked' && e.reason.includes('队列已满'))).toBe(true)
    expect(s.actions.queue.length).toBe(1)
  })

  it('startAction：材料不足时阻塞且不改变状态', () => {
    const s = newGame('T', 0)
    const ev = applyCommand(
      s,
      { type: 'startAction', ref: { kind: 'craft', recipeId: 'smelt_copper' }, count: 1, mode: 'now' },
      0,
    )
    expect(ev.some((e) => e.type === 'blocked' && e.reason.includes('材料不足'))).toBe(true)
    expect(s.actions.current).toBeNull()
  })

  it('装备：直接替换同槽位；卸下后槽位为空', () => {
    const s = newGame('T', 0)
    const a = addInstance(s, 'pick_copper')
    const b = addInstance(s, 'pick_iron')
    applyCommand(s, { type: 'equip', instanceId: a }, 0)
    expect(s.slots.pick).toBe(a)
    applyCommand(s, { type: 'equip', instanceId: b }, 0)
    expect(s.slots.pick).toBe(b)
    applyCommand(s, { type: 'unequip', slot: 'pick' }, 0)
    expect(s.slots.pick).toBeUndefined()
  })

  it('回收：材料按价值换金；装备中不可回收', () => {
    const s = newGame('T', 0)
    s.materials['ore_copper'] = 10
    const ev = applyCommand(s, { type: 'recycleMaterial', itemId: 'ore_copper', qty: 4 }, 0)
    expect(ev.some((e) => e.type === 'goldGained' && e.amount === 8)).toBe(true) // 单价 2 × 4
    expect(materialCount(s, 'ore_copper')).toBe(6)

    const id = addInstance(s, 'pick_copper')
    s.slots.pick = id
    const blocked = applyCommand(s, { type: 'recycleInstance', instanceId: id }, 0)
    expect(blocked.some((e) => e.type === 'blocked' && e.reason.includes('卸下'))).toBe(true)

    delete s.slots.pick
    const ok = applyCommand(s, { type: 'recycleInstance', instanceId: id }, 0)
    expect(ok.some((e) => e.type === 'goldGained' && e.amount === 30)).toBe(true) // 铜镐回收价 30
    expect(s.equipment.length).toBe(0)
  })

  it('队列扩容（v1.9 扩展至 6）：价格 300 → 1200 → 5000 → 20000，金币不足阻塞，达上限阻塞', () => {
    const s = newGame('T', 0)
    s.gold = 299
    expect(
      applyCommand(s, { type: 'buyQueueSlot' }, 0).some((e) => e.type === 'blocked' && e.reason.includes('金币不足')),
    ).toBe(true)

    s.gold = 300
    expect(applyCommand(s, { type: 'buyQueueSlot' }, 0)).toHaveLength(1)
    expect(s.queueSlots).toBe(2)
    expect(s.gold).toBe(0)

    s.gold = 1200
    applyCommand(s, { type: 'buyQueueSlot' }, 0)
    expect(s.queueSlots).toBe(3)
    expect(s.gold).toBe(0)

    s.gold = 4999
    expect(applyCommand(s, { type: 'buyQueueSlot' }, 0).some((e) => e.type === 'blocked')).toBe(true)
    s.gold = 5000
    applyCommand(s, { type: 'buyQueueSlot' }, 0)
    expect(s.queueSlots).toBe(4)
    expect(s.gold).toBe(0)

    s.gold = 20000
    applyCommand(s, { type: 'buyQueueSlot' }, 0)
    expect(s.queueSlots).toBe(5)
    expect(s.gold).toBe(0)

    s.gold = 59999
    expect(applyCommand(s, { type: 'buyQueueSlot' }, 0).some((e) => e.type === 'blocked')).toBe(true)
    s.gold = 60000
    applyCommand(s, { type: 'buyQueueSlot' }, 0)
    expect(s.queueSlots).toBe(6) // 达上限
    expect(
      applyCommand(s, { type: 'buyQueueSlot' }, 0).some((e) => e.type === 'blocked' && e.reason.includes('没有更多')),
    ).toBe(true)
  })

  it('强化目标校验：等级不匹配时阻塞', () => {
    const s = newGame('T', 0)
    const id = addInstance(s, 'pick_copper', 2)
    s.materials['ingot_copper'] = 100
    s.materials['essence'] = 100
    const ev = applyCommand(
      s,
      { type: 'startAction', ref: { kind: 'enhance', instanceId: id, targetLevel: 5 }, count: 1, mode: 'now' },
      0,
    )
    expect(ev.some((e) => e.type === 'blocked' && e.reason.includes('不匹配'))).toBe(true)
  })
})
