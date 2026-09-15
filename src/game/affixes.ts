// ============================================================
// Forging · 词缀引擎（v2.1）
// 纯函数域：装备词缀的 roll / 品质 / 完美度 / 重铸造价（状态变更在 commands 层）
// 设计：docs/design-v2.1.md §2
// 规则：
//   - 条数由档位决定；池由装备原型（= 物品 category）决定；池内不重复
//   - value = max(tier) × roll，roll ∈ [rollMin, rollMax]；quality = value / max
//   - 造装 roll 由 (itemId, instanceId) 确定性派生（防读档洗词缀、迁移可复现）
//   - 重铸使用注入 rng（真随机赌局）
// ============================================================
import { AFFIX_BY_ID, CONTENT, itemDef } from './content'
import { mulberry32, type Rng } from './rng'
import type { AffixArchetype, AffixDef, AffixRoll, ItemDef, ItemId } from './types'

const DEF = CONTENT.affixes

export function affixDef(id: string): AffixDef {
  const d = AFFIX_BY_ID.get(id)
  if (!d) throw new Error(`未知词缀: ${id}`)
  return d
}

/** 装备原型（决定词缀池）；非装备返回 null */
export function archetypeOf(def: ItemDef): AffixArchetype | null {
  if (def.category === 'tool' || def.category === 'weapon' || def.category === 'armor' || def.category === 'jewelry') {
    return def.category
  }
  return null
}

export function poolOf(def: ItemDef): readonly string[] {
  const arch = archetypeOf(def)
  return arch ? DEF.pools[arch] ?? [] : []
}

/** 该档位应有的词缀条数（非装备 / 无档位 → 0；并受池大小限制） */
export function affixCountOf(def: ItemDef): number {
  if (!def.tier || !archetypeOf(def)) return 0
  const byTier = DEF.countByTier[String(def.tier)] ?? 0
  return Math.min(byTier, poolOf(def).length)
}

/** 单条词缀在该档位的完美值 */
export function affixMax(def: AffixDef, tier: number): number {
  return def.base + def.perTier * (tier - 1)
}

/** 品质：value / max(档位)（0 = 空；正常 ∈ [rollMin, rollMax]） */
export function affixQuality(itemId: ItemId, roll: AffixRoll): number {
  const def = itemDef(itemId)
  if (!def.tier) return 0
  const max = affixMax(affixDef(roll.id), def.tier)
  return max > 0 ? roll.value / max : 0
}

/** 单件装备的整体完美度（各词缀品质均值；无词缀 → 0） */
export function perfectScore(itemId: ItemId, affixes: readonly AffixRoll[]): number {
  if (affixes.length === 0) return 0
  let sum = 0
  for (const a of affixes) sum += affixQuality(itemId, a)
  return sum / affixes.length
}

/** 品质达到「完美」阈值的词缀条数 */
export function perfectAffixCount(itemId: ItemId, affixes: readonly AffixRoll[]): number {
  let n = 0
  for (const a of affixes) if (affixQuality(itemId, a) >= DEF.perfectThreshold) n += 1
  return n
}

// ---------------- roll ----------------

function round5(v: number): number {
  return Math.round(v * 1e5) / 1e5
}

/** 单条词缀抽值 */
function rollValue(rng: Rng, def: AffixDef, tier: number): number {
  const span = DEF.rollMax - DEF.rollMin
  return round5(affixMax(def, tier) * (DEF.rollMin + rng.next() * span))
}

/**
 * 用给定随机源抽取一整套词缀（池内不重复，条数由档位决定）。
 * excludeIds：本次**不参与抽取**的词缀 id（重铸锁定条占用，见 rerollAffixes）
 */
export function rollAffixesWith(
  rng: Rng,
  itemId: ItemId,
  excludeIds: readonly string[] = [],
  forcedId?: string,
): AffixRoll[] {
  const def = itemDef(itemId)
  const n = affixCountOf(def)
  if (n <= 0 || !def.tier) return []
  const excluded = new Set(excludeIds)
  const pool = poolOf(def).filter((id) => !excluded.has(id))
  const need = Math.min(n, pool.length)
  // Fisher–Yates 取前 need（按 rng 决定）
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  const chosen = pool.slice(0, need)
  // v2.4 定向重铸券：forcedId 必占一个槽位（调用方已保证它在池内且未被排除）
  if (forcedId !== undefined && poolOf(def).includes(forcedId) && !chosen.includes(forcedId) && chosen.length > 0) {
    chosen[chosen.length - 1] = forcedId
  }
  return chosen.map((id) => ({ id, value: rollValue(rng, affixDef(id), def.tier as number) }))
}

/** 确定性种子：(itemId, instanceId, salt) → uint32 */
function seedOf(itemId: string, instanceId: number, salt: number): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < itemId.length; i++) {
    h ^= itemId.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  h ^= Math.imul((instanceId + 0x9e3779b9) >>> 0, 2654435761) >>> 0
  h ^= Math.imul((salt + 0x85ebca6b) >>> 0, 2246822507) >>> 0
  return h >>> 0
}

/**
 * 造装时的词缀（确定性）：同一 (itemId, instanceId, salt) 永远得到同一套词缀。
 * 兼容旧档：迁移时用同一函数回填，无需玩家操作。
 * salt 为**存档内私有随机数**（meta.affixSalt）：阻断"公开种子表 + 廉价垫刀"的外部预计算
 * （残余风险：玩家自读存档仍可推算，属已知边界，见 docs/design-v2.1.md §6）。
 */
export function rollAffixes(itemId: ItemId, instanceId: number, salt = 0): AffixRoll[] {
  return rollAffixesWith(mulberry32(seedOf(itemId, instanceId, salt)), itemId)
}

/**
 * 重铸：保留锁定下标对应的词缀（含原值与品质），其余按「池 − 已锁定 id」重新抽取。
 * v2.4：可传入 `ticketAffixId`（定向重铸券）——该 id 从抽取池剔除后由 `forcedId` 保证必出现，
 * 数值仍按正常 roll 抽取；条数不变、同名词缀不重复（设计 §2.3 / 评审 B1）。
 */
export function rerollAffixes(
  rng: Rng,
  itemId: ItemId,
  current: readonly AffixRoll[],
  locks: readonly number[],
  ticketAffixId?: string,
): AffixRoll[] {
  const locked = new Set(locks)
  const keptIds = current.filter((_, i) => locked.has(i)).map((a) => a.id)
  const exclude = ticketAffixId ? [...keptIds, ticketAffixId] : keptIds
  const fresh = rollAffixesWith(rng, itemId, exclude, ticketAffixId)
  let k = 0
  return current.map((a, i) => (locked.has(i) ? a : fresh[k++] ?? a))
}

// ---------------- 属性折算 ----------------

/** 词缀属性汇总（加法池；guard / goldFind / stoneFind 为词缀专有效果） */
export interface AffixBonus {
  speed: number
  quantity: number
  efficiency: number
  wisdom: number
  rareFind: number
  enhanceRate: number
  guard: number
  goldFind: number
  /** 重铸石掉落加成（勘探） */
  stoneFind: number
}

export function emptyAffixBonus(): AffixBonus {
  return {
    speed: 0,
    quantity: 0,
    efficiency: 0,
    wisdom: 0,
    rareFind: 0,
    enhanceRate: 0,
    guard: 0,
    goldFind: 0,
    stoneFind: 0,
  }
}

export function affixBonusOf(affixes: readonly AffixRoll[]): AffixBonus {
  const out = emptyAffixBonus()
  for (const a of affixes) {
    const def = AFFIX_BY_ID.get(a.id)
    if (!def) continue
    out[def.effect] += a.value
  }
  return out
}

// ---------------- 重铸 ----------------

export interface ReforgeCost {
  gold: number
  essence: number
  emberstone: number
}

export const REFORGE_STONE: ItemId = 'emberstone'

/** 重铸造价（lockCount = 本次保留不重摇的词缀条数）；非装备返回 null */
export function reforgeCost(itemId: ItemId, lockCount: number): ReforgeCost | null {
  const def = itemDef(itemId)
  if (!def.tier || affixCountOf(def) <= 0) return null
  const tierKey = String(def.tier)
  const baseGold = DEF.reforge.goldByTier[tierKey] ?? 0
  const essence = DEF.reforge.essenceByTier[tierKey] ?? 0
  const gold = Math.round(baseGold * (1 + DEF.reforge.lockGoldFactor * lockCount))
  return { gold, essence, emberstone: lockCount * DEF.reforge.emberstonePerLock }
}

/** 该物品最多可锁定的词缀条数（至少留 1 条参与重摇） */
export function maxLocks(itemId: ItemId): number {
  return Math.max(0, affixCountOf(itemDef(itemId)) - 1)
}

/** 校验锁定下标：唯一、落在 [0, n)、且至少留 1 条参与重摇；返回错误原因或 null */
export function lockIssue(count: number, locks: readonly number[]): string | null {
  const seen = new Set<number>()
  for (const i of locks) {
    if (!Number.isInteger(i) || i < 0 || i >= count) return '锁定的词缀下标非法'
    if (seen.has(i)) return '重复锁定同一条词缀'
    seen.add(i)
  }
  if (seen.size >= count) return '至少需要保留 1 条词缀参与重铸'
  return null
}
