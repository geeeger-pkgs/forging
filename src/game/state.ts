// ============================================================
// Forging · 状态工厂与基础操作
// 约定：内核函数原地修改传入的 state（调用方持有可变更副本）
// ============================================================
import { CONTENT } from './content'
import type { EquipInstance, GameState, ItemId } from './types'

export function newGame(name: string, now: number): GameState {
  return {
    version: 1,
    character: { name, createdAt: now },
    skills: { mining: 0, smelting: 0, forging: 0, enhancing: 0 },
    materials: {},
    equipment: [],
    slots: {},
    nextInstanceId: 1,
    gold: 0,
    actions: { current: null, queue: [] },
    queueSlots: CONTENT.config.defaultQueueSlots,
    buffs: [],
    flags: {
      tutorial: { current: 1, progress: 0, completed: [], claimed: [] },
      achievements: { unlocked: [] },
    },
    meta: {
      lastSeenAt: now,
      carry: { items: {} },
      tasks: { dailyDate: '', daily: [], rerollsLeft: 1, paidRerollsLeft: 3, weekKey: '', weekly: null },
      prestige: { points: 0, perks: {} },
      autoRecycle: {},
      loadouts: [],
    },
    stats: {
      totalCrafts: 0,
      totalEnhances: 0,
      totalMines: 0,
      totalSmelts: 0,
      totalForges: 0,
      totalGoldEarned: 0,
      totalCratesOpened: 0,
      totalTasksDone: 0,
      totalWeekliesDone: 0,
      totalJewelryForged: 0,
      totalRunesCrafted: 0,
      totalPrestiges: 0,
      totalPrestigePointsEarned: 0,
    },
  }
}

// ---------- 材料 ----------

export function materialCount(state: GameState, itemId: ItemId): number {
  return state.materials[itemId] ?? 0
}

export function addMaterial(state: GameState, itemId: ItemId, qty: number): void {
  state.materials[itemId] = materialCount(state, itemId) + qty
}

/** 扣除材料；不足则不扣除并返回 false */
export function removeMaterial(state: GameState, itemId: ItemId, qty: number): boolean {
  const have = materialCount(state, itemId)
  if (have < qty) return false
  const left = have - qty
  if (left === 0) delete state.materials[itemId]
  else state.materials[itemId] = left
  return true
}

// ---------- 装备实例 ----------

export function instanceById(state: GameState, instanceId: number): EquipInstance | undefined {
  return state.equipment.find((e) => e.instanceId === instanceId)
}

/** 新增装备实例并返回 instanceId */
export function addInstance(state: GameState, itemId: ItemId, enhanceLevel = 0): number {
  const id = state.nextInstanceId++
  state.equipment.push({ instanceId: id, itemId, enhanceLevel })
  return id
}

/** 该物品当前已装备的 instanceId（无则 undefined） */
export function equippedIdOf(state: GameState, itemId: ItemId): number | undefined {
  for (const instId of Object.values(state.slots)) {
    if (instId === undefined) continue
    const inst = instanceById(state, instId)
    if (inst && inst.itemId === itemId) return instId
  }
  return undefined
}

// ---------- 金币 ----------

export function addGold(state: GameState, amount: number): void {
  state.gold += amount
  // 累计获得金币为单调计数器（仅正数入账；消费不回收）
  if (amount > 0) state.stats.totalGoldEarned += amount
}

// ---------- 装备查询 ----------

/** 未被装备的实例（配方消耗与强化判定使用） */
export function freeInstances(state: GameState, itemId: ItemId): EquipInstance[] {
  const equipped = new Set(Object.values(state.slots).filter((v): v is number => v !== undefined))
  return state.equipment.filter((e) => e.itemId === itemId && !equipped.has(e.instanceId))
}

export function isEquipped(state: GameState, instanceId: number): boolean {
  return Object.values(state.slots).includes(instanceId)
}
