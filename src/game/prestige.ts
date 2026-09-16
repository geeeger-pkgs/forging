// ============================================================
// Forging · 传承系统（v1.5）
// 解锁：总等级 ≥ config.prestigeUnlockLevel（120）
// 结算（v3.4 三审定稿）：精通点 = f(最低技能) = steps²，steps = ⌊(min − 40)/10⌋（见 prestigePointsFor）
// 重置：技能等级/经验（至起点精通加成）、当前动作、队列
// 保留：材料/装备/金币/成就/任务/队列位/增益
// v1.9 深造：基础上限后可继续购买（价格 ×2），上限 = 基础上限 ×2
// ============================================================
import { CONTENT, PERK_BY_ID } from './content'
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
 * v3.4 W1（复审重做）：精通点 = f(**最低技能等级**)，与总等级无关。
 * 为什么这么改：评审用全域扫描证明"点数随总等级"必然留下边界最优（单技能冲高 + 其余躺平，
 * 如 [51,37,36,36] → 3.30×、[100,60,60,60] → 2.1×）。改成只看最低技能后：
 *   点/h 随最低技能**单调递增** → 满级（100×4）严格最优，任何"偏科/浅均衡"策略收益为 0。
 * 口径（三审定稿）：min < 50 → 0 点；否则 steps = ⌊(min − 40)/10⌋，点数 = steps²（1/4/9/16/25/36）。
 */

/** 拿到第 1 点所需的最低技能等级（min ≥ 此值才有点数） */
export const PRESTIGE_FIRST_POINT_SKILL = 50

export function prestigePointsFor(state: GameState): number {
  const ids = Object.keys(state.skills) as SkillId[]
  const levels = ids.map((id) => levelInfo(state.skills[id]).level)
  const minLv = Math.min(...levels)
  if (minLv < PRESTIGE_FIRST_POINT_SKILL) return 0
  // 三审建议参数：steps = ⌊(min − 40)/10⌋，点数 = steps²（min 50/60/70/80/90/100 → 1/4/9/16/25/36）
  // 选择理由（评审复算）：点/h 仍严格单调、全域最优仍是满级，且毕业回到 2.17 次满级轮回、
  // 消除"差一级全归零"的断崖（此前 min70+4×steps² 把首点门槛抬了 32 倍）
  const steps = Math.floor((minLv - 40) / 10)
  const points = steps * steps
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
    const levels = (Object.keys(state.skills) as SkillId[]).map((id) => levelInfo(state.skills[id]).level)
    const minLv = Math.min(...levels)
    return [
      {
        type: 'blocked',
        reason: `最低技能需达到 Lv${PRESTIGE_FIRST_POINT_SKILL} 才有第 1 点（现 Lv${minLv}）——精通要求四项均衡`,
      },
    ]
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
