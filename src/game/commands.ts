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
  poolOf,
  reforgeCost,
  rerollAffixes,
} from './affixes'
import { CONTENT, itemDef } from './content'
import {
  HOUR_MS,
  busyCompanions,
  claimExpedition,
  dispatchBlockReason,
  recruit,
  rerollTrait,
  routeDef,
  effectiveSquad,
  squadOf,
  supplyCost,
  teamSize,
  upgradeBanner,
} from './expeditions'
import { buyAbyssItem, challengeAbyss, consumeTicket, sweepAbyss, ticketUsable } from './abyss'
import { recordAffix } from './codex'
import { recycleGain } from './economy'
import { refLabel } from './refs'
import { systemRng, type Rng } from './rng'
import { durationOf } from './rules'
import { isSoftBlock, startBlockReason } from './blocking'
import { simulate } from './settle'
import {
  addGold,
  addMaterial,
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
import type {
  ActionRef,
  ActiveAction,
  Command,
  EquipInstance,
  GameEvent,
  GameState,
  ItemId,
  LoadoutAction,
  SettingsState,
  SlotId,
} from './types'

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
    case 'moveQueueItem':
      return moveQueueItem(state, cmd.from, cmd.to)
    case 'equip':
      return equip(state, cmd.instanceId)
    case 'unequip': {
      // v3.2 评审 N2：卸下要给反馈。此前返回空事件 → 弹窗里按钮静默消失；
      // 若玩家开过实例级自动回收，装备会立刻被卖掉，看起来像"装备凭空消失"
      const id = state.slots[cmd.slot]
      const inst = typeof id === 'number' ? instanceById(state, id) : null
      const name = inst ? itemDef(inst.itemId).name : null
      delete state.slots[cmd.slot]
      return name ? [{ type: 'notice', text: `已卸下「${name}」→ 行囊` }] : []
    }
    case 'recycleMaterial':
      return recycleMaterial(state, cmd.itemId, cmd.qty)
    case 'recycleInstance':
      return recycleInstance(state, cmd.instanceId)
    case 'buyQueueSlot':
      return buyQueueSlot(state)
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
      return reforgeInstance(state, cmd.instanceId, cmd.locks, rng ?? systemRng(), cmd.ticketAffixId)
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
    case 'challengeAbyss': {
      const events: GameEvent[] = []
      challengeAbyss(state, now, events, cmd.floors ?? 1)
      return events
    }
    case 'sweepAbyss': {
      const events: GameEvent[] = []
      sweepAbyss(state, now, events, cmd.count ?? 1)
      return events
    }
    case 'buyAbyssItem': {
      const events: GameEvent[] = []
      buyAbyssItem(state, cmd.itemId, events)
      return events
    }
    case 'upgradeBanner': {
      const events: GameEvent[] = []
      upgradeBanner(state, events)
      return events
    }
    case 'saveGearSet':
      return saveGearSet(state, cmd.name)
    case 'applyGearSet':
      return applyGearSet(state, cmd.setId)
    case 'deleteGearSet':
      return deleteGearSet(state, cmd.setId)
    case 'buyGoldShopItem': {
      const events: GameEvent[] = []
      buyGoldShopItem(state, cmd.id, events)
      return events
    }
    case 'tidyBag': {
      const events: GameEvent[] = []
      tidyBag(state, events)
      return events
    }
    case 'setAutoRecyclePerfect': {
      const v = Math.max(0, Math.min(100, Math.round(cmd.pct)))
      state.meta.autoRecyclePerfect = v
      return [{ type: 'notice', text: v === 0 ? '已关闭实例级自动回收' : `实例级自动回收：低于完美度 ${v}% 的未装备实例将自动回收` }]
    }
    case 'setSettings':
      return applySettings(state, cmd.patch)
  }
}

/**
 * v3.0 L2：行囊整理 —— 同一 itemId 只保留**最高完美度**的那件（其余回收换金）。
 * 已装备的实例永不回收；同分保留 instanceId 较小者（确定性）。
 */
function tidyBag(state: GameState, events: GameEvent[]): void {
  const groups = new Map<string, EquipInstance[]>()
  for (const inst of state.equipment) {
    if (isEquipped(state, inst.instanceId)) continue
    const list = groups.get(inst.itemId) ?? []
    list.push(inst)
    groups.set(inst.itemId, list)
  }
  let sold = 0
  let gold = 0
  for (const [, list] of groups) {
    if (list.length <= 1) continue
    // v3.0 测评 D2：并列时保留**高强化**（回收价不含强化投入，卖强留弱=白扔资产）
    const sorted = [...list].sort(
      (a, b) =>
        perfectScore(b.itemId, b.affixes) - perfectScore(a.itemId, a.affixes) ||
        (b.enhanceLevel ?? 0) - (a.enhanceLevel ?? 0) ||
        a.instanceId - b.instanceId,
    )
    for (const inst of sorted.slice(1)) {
      const evs = recycleInstance(state, inst.instanceId)
      for (const e of evs) if (e.type === 'goldGained') gold += e.amount
      sold += 1
    }
  }
  if (sold > 0) events.push({ type: 'notice', text: `行囊整理：回收 ${sold} 件低完美度重复装备（+${gold} 金）` })
  else events.push({ type: 'notice', text: '行囊已是最优：每个原型只保留一件最高完美度装备' })
}

/**
 * v2.5：表现层设置。非法值被夹紧（volume 0~100、fx 必须在 fxLevels 内）
 * 而不是拒绝整条命令 —— 滑块/下拉框的越界输入不应打断玩家操作。
 */
function applySettings(state: GameState, patch: Partial<SettingsState>): GameEvent[] {
  const cur: SettingsState = state.meta.settings ?? { ...CONTENT.fx.defaults }
  const next: SettingsState = { ...cur }
  if (typeof patch.sound === 'boolean') next.sound = patch.sound
  if (typeof patch.volume === 'number' && Number.isFinite(patch.volume)) {
    next.volume = Math.max(0, Math.min(100, Math.round(patch.volume)))
  }
  if (patch.fx && (patch.fx === 'auto' || CONTENT.fx.fxLevels.includes(patch.fx))) next.fx = patch.fx
  state.meta.settings = next
  return [{ type: 'settingsChanged', settings: { ...next } }]
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
  const soft = isSoftBlock(reason)
  // v3.7.20（用户验收场景）：立即开始必须可行；**入队允许软阻塞**（材料/装备暂时不足）——
  // 玩家要能预排生产链（如无材料时排「挖掘×1 → 熔炼×10 → 锻造×1」，靠上游产出喂下游），
  // 轮到该项时会自动尝试（仍不足则跳过并提示）。硬阻塞（等级/物品不存在/目标不匹配）仍拒绝。
  if (reason && (mode === 'now' || !soft)) return [{ type: 'blocked', reason }]

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
  // v3.1：加入队列给出明确反馈（此前完全静默，测评 B-5）；v3.7.20：软阻塞项的说明
  return [
    {
      type: 'notice',
      text: soft
        ? `已加入队列：${refLabel(ref)}（材料不足，轮到时会自动尝试，仍不足则跳过）`
        : `已加入队列：${refLabel(ref)}`,
    },
  ]
}

/**
 * 调整队列顺序（v3.7.22，用户要求：上移/下移/置顶/置底）。
 * UI 把四种操作换算成 from→to：上移 = to-1、下移 = to+1、置顶 = 0、置底 = len-1。
 * 越界或原位不动静默忽略（返回空事件），合法移动给出明确反馈。
 */
function moveQueueItem(state: GameState, from: number, to: number): GameEvent[] {
  const q = state.actions.queue
  const n = q.length
  if (!Number.isInteger(from) || !Number.isInteger(to)) return []
  if (from < 0 || from >= n || to < 0 || to >= n || from === to) return []
  const [item] = q.splice(from, 1)
  q.splice(to, 0, item)
  return [{ type: 'notice', text: `队列已调整：${refLabel(item.ref)} → 第 ${to + 1} 位` }]
}

function stopAction(state: GameState): GameEvent[] {
  if (!state.actions.current) return []
  state.actions.current = null
  return [{ type: 'actionStopped', reason: 'user' }]
}

export { startBlockReason, isSoftBlock }

// 动作可行性预检已下沉到 ./blocking（settle 也要用，避免循环依赖）——此处 re-export 保持既有 API
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

// ---------------- v3.1 装备预设（深渊换装的落地条件） ----------------

/** 最多 3 套（UI 一屏放得下，也不至于让"预设"变成第二种行囊） */
export const MAX_GEAR_SETS = 3

function saveGearSet(state: GameState, name: string): GameEvent[] {
  const sets = (state.meta.gearSets ??= [])
  const slots: Partial<Record<SlotId, number>> = {}
  for (const [slot, instId] of Object.entries(state.slots)) {
    if (typeof instId === 'number') slots[slot as SlotId] = instId
  }
  if (Object.keys(slots).length === 0) return [{ type: 'blocked', reason: '当前没有已装备的物品' }]
  const trimmed = name.trim().slice(0, 10) || `配装${sets.length + 1}`
  const id = `gs_${Date.now().toString(36)}_${sets.length}`
  sets.push({ id, name: trimmed, slots })
  // 超出上限：挤掉最旧的一套（与 toast 上限同一取舍：保留最近的）
  while (sets.length > MAX_GEAR_SETS) sets.shift()
  if (!sets.some((s) => s.id === id)) {
    // 被挤掉的正是刚存的（理论上不会发生）→ 兜底替换最后一套
    sets[sets.length - 1] = { id, name: trimmed, slots }
  }
  return [{ type: 'notice', text: `已保存配装「${trimmed}」（${Object.keys(slots).length} 件）` }]
}

function applyGearSet(state: GameState, setId: string): GameEvent[] {
  const sets = state.meta.gearSets ?? []
  const set = sets.find((s) => s.id === setId)
  if (!set) return [{ type: 'blocked', reason: '配装不存在' }]
  const events: GameEvent[] = []
  const missing: string[] = []
  for (const [slot, instId] of Object.entries(set.slots) as [SlotId, number][]) {
    const inst = instanceById(state, instId)
    if (!inst) {
      missing.push(slot)
      continue
    }
    state.slots[slot] = instId
  }
  // 预设里没有的槽位：保持现状（不主动卸下 —— 避免"穿一半"的意外）
  events.push({
    type: 'notice',
    text: missing.length
      ? `已应用配装「${set.name}」（${missing.length} 件已不存在，跳过：${missing.join('、')}）`
      : `已应用配装「${set.name}」`,
  })
  return events
}

function deleteGearSet(state: GameState, setId: string): GameEvent[] {
  const sets = state.meta.gearSets ?? []
  const i = sets.findIndex((s) => s.id === setId)
  if (i < 0) return [{ type: 'blocked', reason: '配装不存在' }]
  const [removed] = sets.splice(i, 1)
  return [{ type: 'notice', text: `已删除配装「${removed.name}」` }]
}

// ---------------- v3.1 金币商店（循环出口） ----------------

export function goldShopItem(id: string) {
  return CONTENT.goldShop.find((x) => x.id === id)
}

/** 第 k 次购买（k 从 0 起）的价格：base × growth^k（四舍五入） */
export function goldShopPrice(id: string, k: number): number | null {
  const def = goldShopItem(id)
  if (!def) return null
  return Math.round(def.basePrice * Math.pow(def.growth, k))
}

/** 当前价格（面板用） */
export function goldShopNextPrice(state: GameState, id: string): number | null {
  return goldShopPrice(id, state.meta.goldShop?.[id] ?? 0)
}

/**
 * 金币商店购买（v3.1 循环出口：金 → 精华 / 重铸石）。
 * 反套利：买价 base ≥ 100 且随次数递增，而材料的回收价（精华 15 / 重铸石 40）恒低于买价，
 * 因此"买了再卖"必然亏损（tests/v31.test.ts 有守护）。
 */
function buyGoldShopItem(state: GameState, id: string, events: GameEvent[]): void {
  const def = goldShopItem(id)
  if (!def) {
    events.push({ type: 'blocked', reason: '商品不存在' })
    return
  }
  const bought = state.meta.goldShop?.[id] ?? 0
  const price = goldShopPrice(id, bought) as number
  if (state.gold < price) {
    events.push({ type: 'blocked', reason: `金币不足（需要 ${price}）` })
    return
  }
  const gain = recycleGain(state, def.itemId, 1)
  if (price <= gain) {
    // 防御：内容表若被改坏（买价 ≤ 回收价）直接拒绝，避免无限套利
    events.push({ type: 'blocked', reason: '该商品价格异常，已阻止购买（内容表错误）' })
    return
  }
  addGold(state, -price)
  addMaterial(state, def.itemId, 1)
  state.meta.goldShop = { ...(state.meta.goldShop ?? {}), [id]: bought + 1 }
  events.push({ type: 'goldGained', amount: -price })
  events.push({ type: 'itemsGained', items: [{ itemId: def.itemId, qty: 1 }] })
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
    // v3.7.20：硬阻塞跳过；软阻塞（材料/装备不足）照常入队（预排生产链，轮到时自动尝试）
    if (reason && !isSoftBlock(reason)) {
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
export function reforgeBlockReason(
  state: GameState,
  instanceId: number,
  locks: readonly number[],
  ticketAffixId?: string,
): string | null {
  const inst = instanceById(state, instanceId)
  if (!inst) return '装备不存在'
  const cost = reforgeCost(inst.itemId, locks.length)
  if (!cost) return '该物品没有词缀，无法重铸'
  const issue = lockIssue(inst.affixes.length, locks)
  if (issue) return issue
  // v3.0 C1（评审 m1）：券类错误也必须进预检 —— 否则按钮不置灰，只能点了看 toast
  if (ticketAffixId !== undefined) {
    const lockedIds = locks.map((i) => inst.affixes[i]?.id).filter((x): x is string => !!x)
    const ticketIssue = ticketUsable(state, inst.itemId, ticketAffixId, lockedIds)
    if (ticketIssue) return ticketIssue
  }
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
  ticketAffixId?: string,
): GameEvent[] {
  const reason = reforgeBlockReason(state, instanceId, locks)
  if (reason) return [{ type: 'blocked', reason }]
  const inst = instanceById(state, instanceId)
  if (!inst) return [{ type: 'blocked', reason: '装备不存在' }]
  const cost = reforgeCost(inst.itemId, locks.length)
  if (!cost) return [{ type: 'blocked', reason: '该物品没有词缀，无法重铸' }]

  // v2.4 定向重铸券（5 条契约，design-v2.4 §2.5 规则 7）：
  // 持有券 / 池内存在 / 不与锁定冲突 / 池内剩余条数足够；任一不满足 → blocked 且**不消耗券**
  if (ticketAffixId !== undefined) {
    const lockedIds = locks.map((i) => inst.affixes[i]?.id).filter((x): x is string => Boolean(x))
    const issue = ticketUsable(state, inst.itemId, ticketAffixId, lockedIds)
    if (issue) return [{ type: 'blocked', reason: issue }]
    const pool = poolOf(itemDef(inst.itemId))
    const remain = pool.filter((id) => id !== ticketAffixId && !lockedIds.includes(id)).length
    const need = inst.affixes.length - locks.length - 1
    if (remain < need) return [{ type: 'blocked', reason: '池内可用词缀不足，无法使用定向重铸券' }]
  }

  addGold(state, -cost.gold)
  if (cost.essence > 0) removeMaterial(state, 'essence', cost.essence)
  if (cost.emberstone > 0) removeMaterial(state, REFORGE_STONE, cost.emberstone)

  const before = perfectScore(inst.itemId, inst.affixes)
  const locked = new Set(locks)
  // 评审 B1：锁定条的 id 必须从抽取池剔除，否则同名词缀会重复
  const next = rerollAffixes(rng, inst.itemId, inst.affixes, locks, ticketAffixId)
  // 契约 5：券只在成功路径消耗
  if (ticketAffixId !== undefined) consumeTicket(state)

  // 累计完美词缀：只统计本次新摇出的完美条（锁定条不重复计数）
  const threshold = CONTENT.affixes.perfectThreshold
  for (let i = 0; i < next.length; i++) {
    if (locked.has(i)) continue
    if (affixQuality(inst.itemId, next[i]) >= threshold) state.stats.perfectAffixes += 1
  }

  inst.affixes = next
  for (const a of next) recordAffix(state, a.id)
  state.stats.totalReforges += 1
  // v3.1：T4+ 计数（赛季"重铸"目标不再能靠 T1 垃圾装备刷）
  if ((itemDef(inst.itemId).tier ?? 0) >= 4) state.stats.totalReforgesT4 = (state.stats.totalReforgesT4 ?? 0) + 1
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
  const reason = dispatchBlockReason(state, routeId, hours, team)
  if (reason) return [{ type: 'blocked', reason }]
  // v3.0 C5：提交与预检共用编队口径（过滤规则一致）；显式超编仍拒绝，空队伍回退"全员并截断"
  const filtered = squadOf(state, team)
  if (filtered.length > teamSize(state)) {
    return [{ type: 'blocked', reason: `队伍上限 ${teamSize(state)} 人` }]
  }
  const ids = team.length > 0 ? filtered : effectiveSquad(state, team)
  if (ids.length === 0) {
    return [{ type: 'blocked', reason: team.some((id) => busyCompanions(state).has(id)) ? '所选伙伴都在远征中' : '队伍里没有伙伴' }]
  }
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
