// ============================================================
// Forging · 状态工厂与基础操作
// 约定：内核函数原地修改传入的 state（调用方持有可变更副本）
// ============================================================
import { perfectAffixCount, rollAffixes } from './affixes'
import { recordAffix, recordItem } from './codex'
import { CONTENT } from './content'
import { emptyCodex } from './codex-store'
import type { EquipInstance, GameState, ItemId } from './types'

export function newGame(name: string, now: number): GameState {
  const state: GameState = {
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
    companions: {},
    abyss: { bestFloor: 0, crystals: 0, stamina: 12, staminaAt: now, purchased: {}, tickets: 0, permanentSpeed: 0, title: false },
    codex: emptyCodex(),
    season: { index: -1, renown: 0, rewardedLevel: 0, tasks: [] },
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
      affixSalt: (Math.floor(Math.random() * 0xffffffff) + 1) >>> 0,
      expeditions: { runs: [], banner: 0, nextRunId: 1 },
      codexMilestones: '',
      seasonUnlockedOnce: false,
      settings: { ...CONTENT.fx.defaults },
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
      totalReforges: 0,
    totalEnhancesT4: 0,
    totalReforgesT4: 0,
      perfectAffixes: 0,
      totalExpeditions: 0,
      totalRecruits: 0,
      totalRelics: 0,
      totalTokensEarned: 0,
      totalAbyssSweeps: 0,
      totalAbyssPurchases: 0,
    },
  }
  // v2.2：初始伙伴（避免「无伙伴→无徽记→无法招募」死锁）
  const starter = CONTENT.expeditions.starter
  const starterDef = CONTENT.companions.companions.find((c) => c.id === starter)
  if (starterDef) {
    state.companions[starter] = { level: starterDef.startLevel, xp: 0, trait: CONTENT.expeditions.traits[0].id }
  }
  return state
}

// ---------- 材料 ----------

export function materialCount(state: GameState, itemId: ItemId): number {
  return state.materials[itemId] ?? 0
}

/**
 * 材料入库的**唯一入口**。
 * v2.3：图鉴在此登记（源头登记，评审 B5——材料会被消耗，"事后扫描"看不到瞬态）
 */
export function addMaterial(state: GameState, itemId: ItemId, qty: number): void {
  state.materials[itemId] = materialCount(state, itemId) + qty
  recordItem(state, itemId)
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

/**
 * 新增装备实例并返回 instanceId。
 * v2.1：造装即带词缀，由 (itemId, instanceId, 存档盐) 确定性派生——
 * 同一存档内结果恒定（读档重造无效、迁移可复现），同时不暴露可公开预计算的种子。
 */
export function addInstance(state: GameState, itemId: ItemId, enhanceLevel = 0): number {
  const id = state.nextInstanceId++
  const affixes = rollAffixes(itemId, id, state.meta.affixSalt ?? 0)
  state.equipment.push({ instanceId: id, itemId, enhanceLevel, affixes })
  state.stats.perfectAffixes += perfectAffixCount(itemId, affixes)
  // v2.3：图鉴登记（源头；含教学/成就奖励发放的装备）
  recordItem(state, itemId)
  for (const a of affixes) recordAffix(state, a.id)
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
