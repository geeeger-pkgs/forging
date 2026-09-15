// ============================================================
// Forging · 命令层（UI 唯一入口）
// 用法（壳层）：dispatch(state, cmd, now, rng) —— 先推进结算，再应用命令
// 约定：命令层不触发模拟；validate 失败返回 blocked 事件（状态不变）
// ============================================================
import {
  REFORGE_STONE,
  affixQuality,
  lockIssue,
  perfectScore,
  reforgeCost,
  rerollAffixes,
} from './affixes'
import { CONTENT, MAX_ENHANCE, RECIPES_BY_ID, SITES_BY_ID, itemDef } from './content'
import {
  HOUR_MS,
  claimExpedition,
  dispatchBlockReason,
  recruit,
  rerollTrait,
  routeDef,
  supplyCost,
  teamSize,
  upgradeBanner,
} from './expeditions'
import { recycleGain } from './economy'
import { levelInfo } from './level'
import { refLabel } from './refs'
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
import type { ActionRef, ActiveAction, Command, GameEvent, GameState, ItemId, LoadoutAction } from './types'

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
    case 'setAutoRecycle':
      return setAutoRecycle(state, cmd.itemId, cmd.keep)
    case 'saveLoadout':
      return saveLoadout(state, cmd.name)
    case 'applyLoadout':
      return applyLoadout(state, cmd.loadoutId, now)
    case 'deleteLoadout':
      return deleteLoadout(state, cmd.loadoutId)
    case 'reforge':
      return reforgeInstance(state, cmd.instanceId, cmd.locks, rng ?? systemRng())
    case 'recruitCompanion':
      return recruitCmd(state, rng ?? systemRng())
    case 'rerollTrait':
      return rerollTraitCmd(state, cmd.companionId, rng ?? systemRng())
    case 'dispatchExpedition':
      return dispatchExpedition(state, cmd.routeId, cmd.hours, cmd.team, now)
    case 'claimExpedition': {
      const events: GameEvent[] = []
      claimExpedition(state, cmd.runId, events)
      return events
    }
    case 'upgradeBanner': {
      const events: GameEvent[] = []
      upgradeBanner(state, events)
      return events
    }
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
  const gain = recycleGain(state, itemId, qty)
  removeMaterial(state, itemId, qty)
  addGold(state, gain)
  return [{ type: 'goldGained', amount: gain }]
}

function recycleInstance(state: GameState, instanceId: number): GameEvent[] {
  const inst = instanceById(state, instanceId)
  if (!inst) return [{ type: 'blocked', reason: '装备不存在' }]
  if (isEquipped(state, instanceId)) return [{ type: 'blocked', reason: '请先卸下再回收' }]
  const gain = recycleGain(state, inst.itemId, 1)
  const idx = state.equipment.findIndex((e) => e.instanceId === instanceId)
  if (idx >= 0) state.equipment.splice(idx, 1)
  addGold(state, gain)
  return [{ type: 'goldGained', amount: gain }]
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

// ---------------- 自动化（v1.7） ----------------

function setAutoRecycle(state: GameState, itemId: ItemId, keep: number | null): GameEvent[] {
  const def = CONTENT.items[itemId]
  if (!def || !def.stackable) return [{ type: 'blocked', reason: '该物品不支持自动回收' }]
  if (keep === null) {
    delete state.meta.autoRecycle[itemId]
  } else {
    state.meta.autoRecycle[itemId] = Math.max(0, Math.floor(keep))
  }
  return []
}

function saveLoadout(state: GameState, name: string): GameEvent[] {
  const actions: LoadoutAction[] = []
  if (state.actions.current) actions.push({ ref: state.actions.current.ref, count: state.actions.current.remaining })
  for (const q of state.actions.queue) actions.push({ ref: q.ref, count: q.remaining })
  if (actions.length === 0) return [{ type: 'blocked', reason: '当前没有可保存的动作' }]
  const trimmed = name.trim().slice(0, 12) || `预设${state.meta.loadouts.length + 1}`
  const id = `lo_${Date.now().toString(36)}_${state.meta.loadouts.length}`
  state.meta.loadouts.push({ id, name: trimmed, actions })
  return []
}

function applyLoadout(state: GameState, loadoutId: string, now: number): GameEvent[] {
  const lo = state.meta.loadouts.find((l) => l.id === loadoutId)
  if (!lo) return [{ type: 'blocked', reason: '预设不存在' }]

  state.actions.current = null
  state.actions.queue = []
  const events: GameEvent[] = []
  const skipped: string[] = []
  for (const a of lo.actions) {
    const reason = startBlockReason(state, a.ref)
    if (reason) {
      skipped.push(reason)
      continue
    }
    const act: ActiveAction = {
      ref: a.ref,
      remaining: a.count,
      startedAt: now,
      durationMs: durationOf(state, a.ref),
      procMisses: 0,
    }
    if (!state.actions.current) {
      state.actions.current = act
      events.push({ type: 'actionStarted', ref: a.ref })
    } else if (state.actions.queue.length < state.queueSlots) {
      state.actions.queue.push(act)
    } else {
      skipped.push('队列已满，剩余动作未加入')
      break
    }
  }
  if (!state.actions.current) {
    return [{ type: 'blocked', reason: skipped[0] ?? '预设中没有可执行的动作' }]
  }
  if (skipped.length > 0) events.push({ type: 'blocked', reason: `已跳过：${skipped.join('；')}` })
  events.push({ type: 'loadoutApplied', name: lo.name })
  return events
}

function deleteLoadout(state: GameState, loadoutId: string): GameEvent[] {
  const i = state.meta.loadouts.findIndex((l) => l.id === loadoutId)
  if (i < 0) return [{ type: 'blocked', reason: '预设不存在' }]
  state.meta.loadouts.splice(i, 1)
  return []
}

// ---------------- 预设预检（v1.9） ----------------

// ---------------- 重铸（v2.1） ----------------

/** 重铸前置校验：返回阻塞原因或 null（UI 预检复用，不改变状态） */
export function reforgeBlockReason(state: GameState, instanceId: number, locks: readonly number[]): string | null {
  const inst = instanceById(state, instanceId)
  if (!inst) return '装备不存在'
  const cost = reforgeCost(inst.itemId, locks.length)
  if (!cost) return '该物品没有词缀，无法重铸'
  const issue = lockIssue(inst.affixes.length, locks)
  if (issue) return issue
  if (state.gold < cost.gold) return `金币不足（需要 ${cost.gold}）`
  if (cost.essence > 0 && materialCount(state, 'essence') < cost.essence) {
    return `${itemDef('essence').name}不足（需要 ${cost.essence}）`
  }
  if (cost.emberstone > 0 && materialCount(state, REFORGE_STONE) < cost.emberstone) {
    return `${itemDef(REFORGE_STONE).name}不足（需要 ${cost.emberstone}）`
  }
  return null
}

/**
 * 重铸：重摇全部未锁定词缀（条数/池不变），锁定条保留原值。
 * 造价 = 金 ×(1 + 0.9×锁定数) + 精华（按档位）+ 重铸石 ×锁定数。
 */
function reforgeInstance(
  state: GameState,
  instanceId: number,
  locks: readonly number[],
  rng: Rng,
): GameEvent[] {
  const reason = reforgeBlockReason(state, instanceId, locks)
  if (reason) return [{ type: 'blocked', reason }]
  const inst = instanceById(state, instanceId)
  if (!inst) return [{ type: 'blocked', reason: '装备不存在' }]
  const cost = reforgeCost(inst.itemId, locks.length)
  if (!cost) return [{ type: 'blocked', reason: '该物品没有词缀，无法重铸' }]

  addGold(state, -cost.gold)
  if (cost.essence > 0) removeMaterial(state, 'essence', cost.essence)
  if (cost.emberstone > 0) removeMaterial(state, REFORGE_STONE, cost.emberstone)

  const before = perfectScore(inst.itemId, inst.affixes)
  const locked = new Set(locks)
  // 评审 B1：锁定条的 id 必须从抽取池剔除，否则同名词缀会重复
  const next = rerollAffixes(rng, inst.itemId, inst.affixes, locks)

  // 累计完美词缀：只统计本次新摇出的完美条（锁定条不重复计数）
  const threshold = CONTENT.affixes.perfectThreshold
  for (let i = 0; i < next.length; i++) {
    if (locked.has(i)) continue
    if (affixQuality(inst.itemId, next[i]) >= threshold) state.stats.perfectAffixes += 1
  }

  inst.affixes = next
  state.stats.totalReforges += 1
  return [
    { type: 'goldGained', amount: -cost.gold },
    { type: 'reforged', instanceId, name: itemDef(inst.itemId).name, before, after: perfectScore(inst.itemId, next) },
  ]
}

/** 预设应用前检查：返回每个动作的阻塞原因（空数组 = 全部可执行） */
export function checkLoadout(state: GameState, loadoutId: string): { label: string; reason: string }[] {
  const lo = state.meta.loadouts.find((l) => l.id === loadoutId)
  if (!lo) return [{ label: '预设', reason: '预设不存在' }]
  const issues: { label: string; reason: string }[] = []
  const capacity = 1 + state.queueSlots
  for (let i = 0; i < lo.actions.length; i++) {
    const a = lo.actions[i]
    if (i >= capacity) {
      issues.push({ label: refLabel(a.ref), reason: `超出队容量 ${capacity}，应用时将被截断` })
      continue
    }
    const reason = startBlockReason(state, a.ref)
    if (reason) issues.push({ label: refLabel(a.ref), reason })
  }
  return issues
}

// ---------------- 远征（v2.2） ----------------

function recruitCmd(state: GameState, rng: Rng): GameEvent[] {
  const events: GameEvent[] = []
  recruit(state, rng, events)
  return events
}

function rerollTraitCmd(state: GameState, companionId: string, rng: Rng): GameEvent[] {
  const events: GameEvent[] = []
  rerollTrait(state, companionId, rng, events)
  return events
}

/**
 * 派遣：**派遣时即扣补给**（离线规则 3）。
 * 战力不足不是阻塞项（只降低成功率与产出）。
 */
function dispatchExpedition(
  state: GameState,
  routeId: string,
  hours: number,
  team: readonly string[],
  now: number,
): GameEvent[] {
  const reason = dispatchBlockReason(state, routeId, hours)
  if (reason) return [{ type: 'blocked', reason }]
  const ids = team.filter((id) => state.companions[id])
  if (ids.length === 0) return [{ type: 'blocked', reason: '队伍里没有伙伴' }]
  if (ids.length > teamSize(state)) return [{ type: 'blocked', reason: `队伍上限 ${teamSize(state)} 人` }]
  const route = routeDef(routeId)
  const supply = supplyCost(state, route, hours, ids)
  if (!removeMaterial(state, supply.itemId, supply.qty)) {
    return [{ type: 'blocked', reason: `补给不足：${itemDef(supply.itemId).name} ×${supply.qty}` }]
  }
  state.meta.expeditions.runs.push({
    id: state.meta.expeditions.nextRunId++,
    routeId,
    hours,
    startedAt: now,
    endsAt: now + hours * HOUR_MS,
    team: [...ids],
    done: false,
    outcome: null,
  })
  return [{ type: 'expeditionDispatched', routeName: route.name, hours }]
}
