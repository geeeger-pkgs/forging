// ============================================================
// Forging · 经验曲线（源级闭式口径，设计 §6）
// XP(L→L+1) = round_halfup( baseXp × ∏ m(k), k=1..L−1 )
// 禁止链式取整（会产生漂移）
// ============================================================
import { CONTENT, MAX_LEVEL } from './content'
import type { SkillId } from './types'

/** k → 乘区系数（k 属于 [fromLevel, 下一段 fromLevel−1]） */
function multFor(k: number): number {
  let m = CONTENT.levelCurve.bands[0].multiplier
  for (const b of CONTENT.levelCurve.bands) if (k >= b.fromLevel) m = b.multiplier
  return m
}

/** L → L+1 所需 XP；L ≥ 上限返回 Infinity */
export function xpToNext(level: number): number {
  if (level >= MAX_LEVEL) return Number.POSITIVE_INFINITY
  let p = CONTENT.levelCurve.baseXp
  for (let k = 1; k <= level - 1; k++) p *= multFor(k)
  return Math.round(p) // 正数场景下 Math.round 即 half-up
}

export interface LevelInfo {
  level: number
  /** 当前等级内已累计 XP */
  xpInto: number
  /** 升下一级所需 XP（满级为 Infinity） */
  xpNeed: number
}

/** 由技能累计 XP 推导等级与进度 */
export function levelInfo(xp: number): LevelInfo {
  let level = 1
  let rem = Math.max(0, xp)
  while (level < MAX_LEVEL) {
    const need = xpToNext(level)
    if (rem < need) return { level, xpInto: rem, xpNeed: need }
    rem -= need
    level++
  }
  return { level: MAX_LEVEL, xpInto: 0, xpNeed: Number.POSITIVE_INFINITY }
}

/** 总等级（各技能等级之和） */
export function totalLevel(skills: Record<SkillId, number>): number {
  let sum = 0
  for (const id of Object.keys(skills) as SkillId[]) sum += levelInfo(skills[id]).level
  return sum
}
