// ============================================================
// Forging · 命令层（UI 唯一入口）
// 用法（壳层）：dispatch(state, cmd, now, rng) —— 先推进结算，再应用命令
// 约定：命令层不触发模拟；validate 失败返回 blocked 事件（状态不变）
// ============================================================
import { CONTENT, MAX_ENHANCE, RECIPES_BY_ID, SITES_BY_ID, itemDef } from './content'
import { levelInfo } from './level'
import { systemRng, type Rng } from './rng'
import { durationOf, enhanceCostFor } from './rules'
import { simulate } from './settle'
import {
  addGold,
  freeInstances,
  instanceById,
  isEquipped,
  materialCount,
  removeMaterial,
} from './state'
import { useRune } from './buffs'
import { openCrate } from './crates'
import { buyPerk, doPrestige, refundPerk } from './prestige'
import { rerollTask } from './tasks'
import { claimTutorial, tutorialProgress } from './tutorial'
import type { ActionRef, ActiveAction, Command, GameEvent, GameState, ItemId } from './types'

/** 壳层便捷入口：先结算已流逝时间，再应用命令 */
export function dispatch(state: GameState, cmd: Command, now: number, rng?: Rng): GameEvent[] {
  const events: GameEvent[] = []
  const rand = rng ?? systemRng()
  simulate(state, now, { mode: 'online', rng: rand, events })
  events.push(...applyCommand(state, cmd, now, rand))
  return events
}

export function applyCommand(state: GameState, cmd: Command, now: number, rng?: Rng): GameEvent[] {
  switch (cmd.type) {
    case 'startAction':
      return startAction(state, cmd.ref, cmd.count, cmd.mode, now)
    case 'stopAction':
      return stopAction(state)
    case 'clearQueue':
      state.actions.queue = []
      return []
    case 'equip':
      return equip(state, cmd.instanceId)
    case 'unequip':
      delete state.slots[cmd.slot]
      return []
    case 'recycleMaterial':
      return recycleMaterial(state, cmd.itemId, cmd.qty)
    case 'recycleInstance':
      return recycleInstance(state, cmd.instanceId)
    case 'buyQueueSlot':
      return buyQueueSlot(state)
    case 'acceptTutorial':
      return cmd.step === state.flags.tutorial.current ? [] : []
    case 'claimTutorial':
      return claimTutorial(state, cmd.step)
    case 'openCrate':
      return openCrate(state, rng)
    case 'rerollTask':
      return rerollTask(state, cmd.index)
    case 'useRune':
      return useRune(state, cmd.itemId, now)
    case 'prestige':
      return doPrestige(state)
    case 'buyPerk':
      return buyPerk(state, cmd.perkId)
    case 'refundPerk':
      return refundPerk(state, cmd.perkId)
  }
}

// ---------------- 动作 ----------------

function startAction(
  state: GameState,
  ref: ActionRef,
  count: number | null,
  mode: 'now' | 'enqueue',
  now: number,
): GameEvent[] {
  if (count !== null && count < 1) return [{ type: 'blocked', reason: '次数必须 ≥ 1 或设为无限' }]
  const reason = startBlockReason(state, ref)
  if (reason) return [{ type: 'blocked', reason }]

  const act: ActiveAction = {
    ref,
    remaining: count,
    startedAt: now,
    durationMs: durationOf(state, ref),
    procMisses: 0,
  }

  if (!state.actions.current || mode === 'now') {
    state.actions.current = act
    return [{ type: 'actionStarted', ref }]
  }
  if (state.actions.queue.length >= state.queueSlots) {
    return [{ type: 'blocked', reason: '队列已满' }]
  }
  state.actions.queue.push(act)
  return []
}

function stopAction(state: GameState): GameEvent[] {
  if (!state.actions.current) return []
  state.actions.current = null
  return [{ type: 'actionStopped', reason: 'user' }]
}

/** 开始前校验（等级 / 材料 / 装备 / 强化目标）；返回阻塞原因或 null */
export function startBlockReason(state: GameState, ref: ActionRef): string | null {
  if (ref.kind === 'mine') {
    const site = SITES_BY_ID.get(ref.siteId)
    if (!site) return `未知矿场: ${ref.siteId}`
    const lv = levelInfo(state.skills[site.skill]).level
    if (lv < site.unlockLevel) return `需要 挖掘 Lv${site.unlockLevel}（当前 ${lv}）`
    return null
  }
  if (ref.kind === 'craft') {
    const r = RECIPES_BY_ID.get(ref.recipeId)
    if (!r) return `未知配方: ${ref.recipeId}`
    const lv = levelInfo(state.skills[r.skill]).level
    if (lv < r.unlockLevel) return `需要 Lv${r.unlockLevel}（当前 ${lv}）`
    return inputShortageReason(state, r.inputs)
  }
  // enhance
  const inst = instanceById(state, ref.instanceId)
  if (!inst) return '被强化物品不存在'
  if (ref.targetLevel > MAX_ENHANCE) return '已达最高强化等级'
  if (ref.targetLevel !== inst.enhanceLevel + 1) return '强化目标与物品当前等级不匹配'
  const cost = enhanceCostFor(inst.itemId, ref.targetLevel)
  for (const c of cost) {
    if (materialCount(state, c.itemId) < c.qty) return `材料不足：${itemDef(c.itemId).name} ×${c.qty}`
  }
  return null
}

function inputShortageReason(
  state: GameState,
  inputs: readonly { itemId: ItemId; qty: number }[],
): string | null {
  for (const inp of inputs) {
    const def = itemDef(inp.itemId)
    if (def.stackable) {
      if (materialCount(state, inp.itemId) < inp.qty) return `材料不足：${def.name} ×${inp.qty}`
    } else {
      const free = freeInstances(state, inp.itemId)
      if (free.length < inp.qty) {
        const total = state.equipment.filter((e) => e.itemId === inp.itemId).length
        const equippedCount = total - free.length
        return equippedCount > 0
          ? `请先卸下：${def.name}（装备中不可消耗）`
          : `缺少装备：${def.name} ×${inp.qty}`
      }
    }
  }
  return null
}

// ---------------- 装备 ----------------

function equip(state: GameState, instanceId: number): GameEvent[] {
  const inst = instanceById(state, instanceId)
  if (!inst) return [{ type: 'blocked', reason: '装备不存在' }]
  const def = itemDef(inst.itemId)
  if (!def.slot) return [{ type: 'blocked', reason: `${def.name} 不可装备` }]
  state.slots[def.slot] = instanceId // 直接替换原槽位装备
  return tutorialProgress(state, 'equipSlot', 1, { slotId: def.slot })
}

// ---------------- 回收 ----------------

function recycleMaterial(state: GameState, itemId: ItemId, qty: number): GameEvent[] {
  if (qty < 1) return [{ type: 'blocked', reason: '回收数量必须 ≥ 1' }]
  if (materialCount(state, itemId) < qty) return [{ type: 'blocked', reason: '数量不足' }]
  const def = itemDef(itemId)
  removeMaterial(state, itemId, qty)
  const gain = def.value * qty
  addGold(state, gain)
  return [{ type: 'goldGained', amount: gain }]
}

function recycleInstance(state: GameState, instanceId: number): GameEvent[] {
  const inst = instanceById(state, instanceId)
  if (!inst) return [{ type: 'blocked', reason: '装备不存在' }]
  if (isEquipped(state, instanceId)) return [{ type: 'blocked', reason: '请先卸下再回收' }]
  const def = itemDef(inst.itemId)
  const idx = state.equipment.findIndex((e) => e.instanceId === instanceId)
  if (idx >= 0) state.equipment.splice(idx, 1)
  addGold(state, def.value)
  return [{ type: 'goldGained', amount: def.value }]
}

// ---------------- 队列扩容 ----------------

/** 下一个队列位的价格；无可购买位返回 null（上限 / 教程位未领） */
export function nextQueueSlotCost(state: GameState): number | null {
  const cfg = CONTENT.config
  if (state.queueSlots >= cfg.maxQueueSlots) return null
  const tutorialGrant = state.flags.tutorial.claimed.includes(8) ? 1 : 0
  const purchased = Math.max(0, state.queueSlots - cfg.defaultQueueSlots - tutorialGrant)
  return cfg.queueSlotCosts[purchased] ?? null
}

function buyQueueSlot(state: GameState): GameEvent[] {
  const cost = nextQueueSlotCost(state)
  if (cost === null) return [{ type: 'blocked', reason: '没有更多可购买的队列位' }]
  if (state.gold < cost) return [{ type: 'blocked', reason: `金币不足（需要 ${cost}）` }]
  addGold(state, -cost)
  state.queueSlots += 1
  return [{ type: 'goldGained', amount: -cost }]
}
