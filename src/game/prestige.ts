// ============================================================
// Forging · 传承系统（v1.5）
// 解锁：总等级 ≥ config.prestigeUnlockLevel（120）
// 结算：精通点 = ⌊总等级 ÷ 10⌋ + 每个满级技能 +1
// 重置：技能等级/经验（至起点精通加成）、当前动作、队列
// 保留：材料/装备/金币/成就/任务/队列位/增益
// ============================================================
import { CONTENT, MAX_LEVEL, PERK_BY_ID } from './content'
import { levelInfo, totalLevel, xpForLevel } from './level'
import type { GameEvent, GameState, SkillId } from './types'

export const PRESTIGE_MIN_LEVEL = CONTENT.config.prestigeUnlockLevel || 120

export function prestigeUnlocked(state: GameState): boolean {
  return totalLevel(state.skills) >= PRESTIGE_MIN_LEVEL
}

/** 本次传承可获得的精通点 */
export function prestigePointsFor(state: GameState): number {
  const total = totalLevel(state.skills)
  let points = Math.floor(total / 10)
  for (const id of Object.keys(state.skills) as SkillId[]) {
    if (levelInfo(state.skills[id]).level >= MAX_LEVEL) points += 1
  }
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
  if (points <= 0) return [{ type: 'blocked', reason: '没有可获得的精通点' }]

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
  if (lv >= def.max) return [{ type: 'blocked', reason: '该精通已满级' }]
  if (state.meta.prestige.points < def.cost) {
    return [{ type: 'blocked', reason: `精通点不足（需要 ${def.cost}）` }]
  }
  state.meta.prestige.points -= def.cost
  state.meta.prestige.perks[perkId] = lv + 1
  return [{ type: 'perkChanged', perkId }]
}

export function refundPerk(state: GameState, perkId: string): GameEvent[] {
  const def = PERK_BY_ID.get(perkId)
  if (!def) return [{ type: 'blocked', reason: '未知精通' }]
  const lv = state.meta.prestige.perks[perkId] ?? 0
  if (lv <= 0) return [{ type: 'blocked', reason: '该精通尚未投入点数' }]
  state.meta.prestige.perks[perkId] = lv - 1
  state.meta.prestige.points += def.cost
  return [{ type: 'perkChanged', perkId }]
}
