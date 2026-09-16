// ============================================================
// Forging · 传承系统（v1.5）
// 解锁：总等级 ≥ config.prestigeUnlockLevel（120）
// 结算（v3.4 A6 改）：精通点 = ⌊(总等级 − 门槛) ÷ 10⌋ + 每个满级技能 ×4
// 重置：技能等级/经验（至起点精通加成）、当前动作、队列
// 保留：材料/装备/金币/成就/任务/队列位/增益
// v1.9 深造：基础上限后可继续购买（价格 ×2），上限 = 基础上限 ×2
// ============================================================
import { CONTENT, MAX_LEVEL, PERK_BY_ID } from './content'
import { levelInfo, totalLevel, xpForLevel } from './level'
import type { GameEvent, GameState, PerkDef, SkillId } from './types'

export const PRESTIGE_MIN_LEVEL = CONTENT.config.prestigeUnlockLevel || 120

/** 深造倍率：基础上限 ×2；超出部分的每级成本 ×2 */
export const PERK_OVERDRIVE_MULT = 2
export const PERK_OVERDRIVE_COST_MULT = 2

/** 精通上限（含深造） */
export function perkMaxLevel(def: PerkDef): number {
  return def.max * PERK_OVERDRIVE_MULT
}

/** 下一级价格（基础上限内 = cost；深造部分 = cost ×2） */
export function perkNextCost(def: PerkDef, currentLevel: number): number {
  return currentLevel < def.max ? def.cost : def.cost * PERK_OVERDRIVE_COST_MULT
}

/** 已购买的第 level 级（level ≥ 1）当时的成本（退款用） */
export function perkLevelCost(def: PerkDef, level: number): number {
  return level <= def.max ? def.cost : def.cost * PERK_OVERDRIVE_COST_MULT
}

export function prestigeUnlocked(state: GameState): boolean {
  return totalLevel(state.skills) >= PRESTIGE_MIN_LEVEL
}

/** 本次传承可获得的精通点 */
/**
 * v3.4 V1：点数要求**均衡**——任一技能等级 < PRESTIGE_MIN_SKILL 则本次得 0 点。
 * 起因（评审）：旧式让"单技能冲到 100"成为刷点最优（混合策略实测 13.1× 倒挂）。
 * 现式：均衡门槛（60）+ ⌊(总等级 − 传承门槛)/10⌋ + 满级技能 ×4。
 */
export const PRESTIGE_MIN_SKILL_RATIO = 0.9 // 最低技能 ≥ 0.85×平均（堵偏科刷点）

export function prestigePointsFor(state: GameState): number {
  const ids = Object.keys(state.skills) as SkillId[]
  const levels = ids.map((id) => levelInfo(state.skills[id]).level)
  const avg = levels.reduce((a, b) => a + b, 0) / levels.length
  if (Math.min(...levels) < avg * PRESTIGE_MIN_SKILL_RATIO) return 0
  const total = totalLevel(state.skills)
  let points = Math.floor(Math.max(0, total - PRESTIGE_MIN_LEVEL) / 10)
  for (const lv of levels) if (lv >= MAX_LEVEL) points += 6 // v3.4 V1：满级技能 ×6（扫描定档：最优/满级 = 1.20×）
  return points
}

export interface PerkBonuses {
  speed: number
  wisdom: number
  efficiency: number
  rareFind: number
  offlineHours: number
  startLevel: number
}

export function perkBonuses(state: GameState): PerkBonuses {
  const out: PerkBonuses = { speed: 0, wisdom: 0, efficiency: 0, rareFind: 0, offlineHours: 0, startLevel: 0 }
  const perks = state.meta.prestige.perks
  for (const def of CONTENT.perks) {
    const lv = perks[def.id] ?? 0
    if (lv <= 0) continue
    out[def.effect] += def.perPoint * lv
  }
  return out
}

export function doPrestige(state: GameState): GameEvent[] {
  if (!prestigeUnlocked(state)) {
    return [{ type: 'blocked', reason: `总等级达到 ${PRESTIGE_MIN_LEVEL} 才能传承` }]
  }
  const points = prestigePointsFor(state)
  if (points <= 0) {
    // v3.4 A6：点数从门槛后起算 → 门槛处为 0；给出可执行的下一步
    const next = PRESTIGE_MIN_LEVEL + 10
    return [{ type: 'blocked', reason: `当前可获得 0 点：总等级达到 ${next} 才有第 1 点（现 ${totalLevel(state.skills)}）` }]
  }

  // 重置：技能（回到起点精通加成的等级）
  const perk = perkBonuses(state)
  const startLevel = 1 + Math.round(perk.startLevel)
  const xp = xpForLevel(startLevel)
  state.skills = { mining: xp, smelting: xp, forging: xp, enhancing: xp }
  // 重置：动作与队列
  state.actions.current = null
  state.actions.queue = []

  // 结算精通点（保留资产：材料/装备/金币/成就/任务/队列位/增益）
  state.meta.prestige.points += points
  state.stats.totalPrestiges += 1
  state.stats.totalPrestigePointsEarned += points
  return [{ type: 'prestigeDone', points }]
}

export function buyPerk(state: GameState, perkId: string): GameEvent[] {
  const def = PERK_BY_ID.get(perkId)
  if (!def) return [{ type: 'blocked', reason: '未知精通' }]
  const lv = state.meta.prestige.perks[perkId] ?? 0
  if (lv >= perkMaxLevel(def)) return [{ type: 'blocked', reason: '该精通已圆满（深造已满）' }]
  const cost = perkNextCost(def, lv)
  if (state.meta.prestige.points < cost) {
    return [{ type: 'blocked', reason: `精通点不足（需要 ${cost}）` }]
  }
  state.meta.prestige.points -= cost
  state.meta.prestige.perks[perkId] = lv + 1
  return [{ type: 'perkChanged', perkId }]
}

export function refundPerk(state: GameState, perkId: string): GameEvent[] {
  const def = PERK_BY_ID.get(perkId)
  if (!def) return [{ type: 'blocked', reason: '未知精通' }]
  const lv = state.meta.prestige.perks[perkId] ?? 0
  if (lv <= 0) return [{ type: 'blocked', reason: '该精通尚未投入点数' }]
  state.meta.prestige.perks[perkId] = lv - 1
  state.meta.prestige.points += perkLevelCost(def, lv)
  return [{ type: 'perkChanged', perkId }]
}
