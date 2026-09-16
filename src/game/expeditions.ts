// ============================================================
// Forging · 远征与伙伴（v2.2）内核
// 设计：docs/design-v2.2.md §2（先模拟后定档，脚本 scripts/sim-expedition.mjs）
// 规则要点：
//   - 战力 = L × R × (1 + 0.02×(L−1))，全队求和后乘旗帜加成（+8%/级）
//   - 成功率 = min(1, 战力 / 需求战力)；**战力不足不阻塞**，只降成功率与产出
//   - 产出只由「伙伴战力 + 路线 + 时长 + 特质」决定，**不吃**任何玩家侧加成
//   - 离线按期望值结算（含小数），领取时用共享小数池结转取整
//   - 领取幂等：领取即从 runs 移除
// ============================================================
import { CONTENT, ROUTE_BY_ID, TRAIT_BY_ID, itemDef } from './content'
import { levelInfo } from './level'
import { randInt, type Rng } from './rng'
import { addGold, addMaterial, materialCount, removeMaterial } from './state'
import type {
  CompanionDef,
  CompanionState,
  ExpeditionOutcome,
  ExpeditionRouteDef,
  GameEvent,
  GameState,
  ItemId,
  SkillId,
} from './types'

const DEF = CONTENT.expeditions
export const HOUR_MS = 3_600_000

// ---------------- 伙伴 ----------------

export function companionDef(id: string): CompanionDef {
  const def = CONTENT.companions.companions.find((c) => c.id === id)
  if (!def) throw new Error(`未知伙伴: ${id}`)
  return def
}

/** 单名伙伴战力：L × R × (1 + 0.02×(L−1)) */
export function companionPower(def: CompanionDef, level: number): number {
  return level * def.rarityFactor * (1 + 0.02 * (level - 1))
}

export function ownedCompanions(state: GameState): { def: CompanionDef; st: CompanionState }[] {
  return Object.entries(state.companions).map(([id, st]) => ({ def: companionDef(id), st }))
}

export function teamSize(state: GameState): number {
  return DEF.team.base + state.meta.expeditions.banner * DEF.team.maxPerBanner
}

export function bannerPowerMultiplier(banner: number): number {
  return Math.pow(1 + DEF.banner.powerPerLevel, banner)
}

/** 队伍战力（ids 缺省 = 全部伙伴） */
/**
 * v3.0 C5（评审 m12/m13）：**唯一编队口径** —— 预检、补给估算、UI 预览、实际提交全走这里。
 * 规则：显式选中优先；否则全体伙伴；剔除远征中/不存在的；按队伍上限截断。
 * 这样"预览虚高"（按全员算补给/折扣）与"提交时才截断"的分叉被彻底消除。
 */
export function squadOf(state: GameState, picked?: readonly string[]): string[] {
  const busy = busyCompanions(state)
  const base = picked && picked.length > 0 ? [...picked] : Object.keys(state.companions)
  return base.filter((id) => state.companions[id] && !busy.has(id)).slice(0, teamSize(state))
}

export function teamPower(state: GameState, ids?: readonly string[]): number {
  const list = ids ? ids.map((id) => ({ def: companionDef(id), st: state.companions[id] })) : ownedCompanions(state)
  let sum = 0
  for (const { def, st } of list) {
    if (!st) continue
    sum += companionPower(def, st.level)
  }
  return sum * bannerPowerMultiplier(state.meta.expeditions.banner)
}

/** 特质叠加：effect → 系数（supply 为乘算衰减，其余为加法） */
export function traitFactors(state: GameState, ids?: readonly string[]): Record<string, number> {
  const list = ids ?? Object.keys(state.companions)
  const out = { supply: 1, gold: 0, xp: 0, find: 0 }
  // 评审 M4：**同一特质每队只生效一次**（不叠加）——否则「全员洗成贪婪」是唯一最优解
  const seen = new Set<string>()
  for (const id of list) {
    const st = state.companions[id]
    if (!st) continue
    const t = TRAIT_BY_ID.get(st.trait)
    if (!t || seen.has(t.id)) continue
    seen.add(t.id)
    if (t.effect === 'supply') out.supply *= 1 + t.value
    else if (t.effect === 'gold') out.gold += t.value
    else if (t.effect === 'xp') out.xp += t.value
    else if (t.effect === 'find') out.find += t.value
  }
  return out
}

export function xpForLevel(level: number): number {
  return Math.round(DEF.levelCurve.base * Math.pow(level, DEF.levelCurve.exponent))
}

/** 伙伴是否已满级 */
export function isMaxLevel(level: number): boolean {
  return level >= CONTENT.companions.startLevelCap
}

// ---------------- 路线 ----------------

export function routeDef(id: string): ExpeditionRouteDef {
  const r = ROUTE_BY_ID.get(id)
  if (!r) throw new Error(`未知路线: ${id}`)
  return r
}

/** 派往前置校验：返回阻塞原因（null = 可派遣）。战力不足**不是**阻塞项。 */
export function dispatchBlockReason(state: GameState, routeId: string, hours: number, picked?: readonly string[]): string | null {
  const route = ROUTE_BY_ID.get(routeId)
  if (!route) return '未知路线'
  if (!DEF.hours.includes(hours)) return '时长档非法'
  const freeze = routeUnlockReason(state, route)
  if (freeze) return freeze
  if (Object.keys(state.companions).length === 0) return '还没有伙伴'
  if (state.meta.expeditions.runs.some((r) => r.routeId === routeId)) return `${route.name}已有远征在进行`
  const busy = busyCompanions(state)
  if (busy.size >= Object.keys(state.companions).length) return '所有伙伴都在远征中（先领取已完成的远征）'
  // v3.0 C5：补给按**实际编队**估算（不再是全员）
  const squad = squadOf(state, picked)
  if (squad.length === 0) return '可派出的伙伴都已在外远征'
  const supply = supplyCost(state, route, hours, squad)
  if (materialCount(state, supply.itemId) < supply.qty) {
    return `补给不足：${itemDef(supply.itemId).name} ×${supply.qty}`
  }
  return null
}

/** 正在远征中的伙伴（含已完成待领取的 run）——同一伙伴同一时刻只能参与一条路线（评审 M4） */
export function busyCompanions(state: GameState): Set<string> {
  const busy = new Set<string>()
  for (const run of state.meta.expeditions.runs) for (const id of run.team) busy.add(id)
  return busy
}

/** 路线解锁条件文案（未满足返回原因，满足返回 null） */
export function routeUnlockReason(state: GameState, route: ExpeditionRouteDef): string | null {
  const u = route.unlock
  if (u.type === 'companion') {
    const n = Object.keys(state.companions).length
    return n >= u.value ? null : `需要 ${u.value} 名伙伴（当前 ${n}）`
  }
  if (u.type === 'skill') {
    const lv = levelOf(state, u.skill)
    return lv >= u.value ? null : `需要 ${u.skill === 'mining' ? '挖掘' : '锻造'} Lv${u.value}（当前 ${lv}）`
  }
  const total = totalLevelOf(state)
  return total >= u.value ? null : `需要总等级 ${u.value}（当前 ${total}）`
}

function levelOf(state: GameState, skill: SkillId): number {
  return levelInfo(state.skills[skill]).level
}

/** 总等级（技能等级之和，用于「深渊前哨」解锁） */
export function totalLevelOf(state: GameState): number {
  let sum = 0
  for (const v of Object.values(state.skills)) sum += levelInfo(v).level
  return sum
}

/** 补给消耗（含「勤勉」特质折扣） */
export function supplyCost(
  state: GameState,
  route: ExpeditionRouteDef,
  hours: number,
  team: readonly string[],
): { itemId: ItemId; qty: number } {
  const raw = (route.supply.qtyPer8h / 8) * hours
  const factor = traitFactors(state, team).supply
  return { itemId: route.supply.itemId, qty: Math.max(1, Math.ceil(raw * factor)) }
}

/** 成功率 = min(1, 战力 / 需求战力) */
export function successRate(state: GameState, route: ExpeditionRouteDef, team: readonly string[]): number {
  return Math.min(1, teamPower(state, team) / route.reqPower)
}

// ---------------- 结算 ----------------

/** 毛产出（金币 + 材料 + 徽记 + 遗物 + 经验） */
export function rollOutcome(
  state: GameState,
  route: ExpeditionRouteDef,
  hours: number,
  team: readonly string[],
  rng: Rng | null,
  mode: 'online' | 'expectation',
): ExpeditionOutcome {
  const f = traitFactors(state, team)
  const rate = successRate(state, route, team)
  const success = mode === 'expectation' ? true : (rng as Rng).next() < rate
  // 期望模式：产出按成功率加权（等价于长期均值）；在线：成功全额 / 失败保底
  const yieldShare = mode === 'expectation' ? rate + (1 - rate) * DEF.failYieldShare : success ? 1 : DEF.failYieldShare
  const gross = route.anchorGoldPerHour * route.ratio * hours * yieldShare
  const gold = gross * DEF.goldShare * (1 + f.gold)
  const matValue = gross * (1 - DEF.goldShare)
  const matQty = matValue / itemDef(route.materialItemId).value

  // 评审 B1：期望模式必须按成功率加权（否则离线徽记/遗物最高可达在线的 2×）
  const findMul = (1 + f.find) * (mode === 'expectation' ? rate + (1 - rate) * 0.5 : success ? 1 : 0.5)
  const tokenExpected = (route.tokenPer8h / 8) * hours * findMul
  const relicExpected = route.relic ? route.relicChancePerHour * hours * findMul : 0
  const stoneExpected = (route.stonePer8h / 8) * hours * yieldShare

  const tokens = mode === 'expectation' ? tokenExpected : fracRoll(rng as Rng, tokenExpected)
  const relics = route.relic ? (mode === 'expectation' ? relicExpected : fracRoll(rng as Rng, relicExpected)) : 0
  const stones = route.stonePer8h > 0 ? (mode === 'expectation' ? stoneExpected : fracRoll(rng as Rng, stoneExpected)) : 0

  const materials: { itemId: ItemId; qty: number }[] = []
  if (matQty > 0) materials.push({ itemId: route.materialItemId, qty: matQty })
  if (stones > 0) materials.push({ itemId: 'emberstone', qty: stones })

  return {
    gold,
    materials,
    tokens,
    relics: route.relic && relics > 0 ? [{ itemId: route.relic, qty: relics }] : [],
    xp: route.xpPerHour * hours * (1 + f.xp),
    success,
    expected: mode === 'expectation',
  }
}

/** 小数期望 → 整数发放（floor + 概率补 1），在线模式下使用 */
function fracRoll(rng: Rng, expected: number): number {
  if (expected <= 0) return 0
  const whole = Math.floor(expected)
  const frac = expected - whole
  return whole + (rng.next() < frac ? 1 : 0)
}

/** 推进：把到期的 run 标记完成并结算（离线窗口由 windowEnd 限定） */
export function advanceExpeditions(
  state: GameState,
  windowEnd: number,
  mode: 'online' | 'expectation',
  rng: Rng | null,
  events?: GameEvent[],
): void {
  for (const run of state.meta.expeditions.runs) {
    if (run.done) continue
    if (run.endsAt > windowEnd) continue
    const route = ROUTE_BY_ID.get(run.routeId)
    if (!route) continue
    run.outcome = rollOutcome(state, route, run.hours, run.team, rng, mode)
    run.done = true
    state.stats.totalExpeditions += 1
    events?.push({
      type: 'expeditionDone',
      routeName: route.name,
      hours: run.hours,
      success: run.outcome.success,
      gold: Math.round(run.outcome.gold),
      expected: run.outcome.expected,
    })
  }
}

/** 领取：应用产物 + 伙伴经验，并从 runs 移除（幂等） */
export function claimExpedition(state: GameState, runId: number, events: GameEvent[]): void {
  const idx = state.meta.expeditions.runs.findIndex((r) => r.id === runId)
  if (idx < 0) {
    events.push({ type: 'blocked', reason: '远征不存在' })
    return
  }
  const run = state.meta.expeditions.runs[idx]
  if (!run.done || !run.outcome) {
    events.push({ type: 'blocked', reason: '远征尚未完成' })
    return
  }
  const route = ROUTE_BY_ID.get(run.routeId)
  const out = run.outcome
  const gold = Math.round(out.gold)
  if (gold > 0) {
    addGold(state, gold)
    events.push({ type: 'goldGained', amount: gold })
  }
  for (const m of out.materials) {
    const whole = applyCarry(state, m.itemId, m.qty)
    if (whole > 0) events.push({ type: 'itemsGained', items: [{ itemId: m.itemId, qty: whole }] })
  }
  for (const r of out.relics) {
    const whole = applyCarry(state, r.itemId, r.qty)
    if (whole > 0) {
      events.push({ type: 'itemsGained', items: [{ itemId: r.itemId, qty: whole }] })
      state.stats.totalRelics += whole
    }
  }
  if (out.tokens > 0) {
    const whole = applyCarry(state, 'expedition_token', out.tokens)
    if (whole > 0) {
      events.push({ type: 'itemsGained', items: [{ itemId: 'expedition_token', qty: whole }] })
      state.stats.totalTokensEarned += whole
    }
  }
  // 伙伴经验（队内共享）
  for (const id of run.team) {
    gainCompanionXp(state, id, out.xp, events)
  }
  state.meta.expeditions.runs.splice(idx, 1)
  events.push({ type: 'expeditionClaimed', routeName: route?.name ?? run.routeId, gold })
}

/** 小数结转（与动作结算共享 state.meta.carry.items） */
function applyCarry(state: GameState, itemId: ItemId, amount: number): number {
  const carry = state.meta.carry.items
  const total = (carry[itemId] ?? 0) + amount
  const whole = Math.floor(total)
  carry[itemId] = total - whole
  if (whole > 0) addMaterial(state, itemId, whole)
  return whole
}

function gainCompanionXp(state: GameState, id: string, xp: number, events: GameEvent[]): void {
  const st = state.companions[id]
  if (!st || xp <= 0) return
  const def = companionDef(id)
  st.xp += xp
  while (!isMaxLevel(st.level) && st.xp >= xpForLevel(st.level)) {
    st.xp -= xpForLevel(st.level)
    st.level += 1
    events.push({ type: 'companionLevelUp', name: def.name, level: st.level })
  }
  if (isMaxLevel(st.level)) st.xp = Math.min(st.xp, xpForLevel(st.level))
}

// ---------------- 招募 / 特质 / 旗帜 ----------------

/** 招募：优先给未拥有的伙伴（按名册顺序）；全部拥有后 → 随机一名 +经验 */
export function recruit(state: GameState, rng: Rng, events: GameEvent[]): void {
  const cost = DEF.recruit
  if (materialCount(state, 'expedition_token') < cost.tokens) {
    events.push({ type: 'blocked', reason: `远征徽记不足（需要 ${cost.tokens}）` })
    return
  }
  if (state.gold < cost.gold) {
    events.push({ type: 'blocked', reason: `金币不足（需要 ${cost.gold}）` })
    return
  }
  removeMaterial(state, 'expedition_token', cost.tokens)
  addGold(state, -cost.gold)
  const roster = CONTENT.companions.companions
  const unowned = roster.find((c) => !state.companions[c.id])
  state.stats.totalRecruits += 1
  if (unowned) {
    state.companions[unowned.id] = { level: unowned.startLevel, xp: 0, trait: randomTrait(rng) }
    events.push({ type: 'companionRecruited', name: unowned.name, duplicate: false })
    return
  }
  // 满员：随机一名转经验
  const pick = roster[randInt(rng, 0, roster.length - 1)]
  gainCompanionXp(state, pick.id, cost.duplicateXp, events)
  events.push({ type: 'companionRecruited', name: pick.name, duplicate: true })
}

/**
 * 随机特质。v3.0 C4（评审 m11）：**排除当前特质** —— 否则花 1 徽记 + 2,000 金
 * 有 1/6 概率毫无变化（玩家无法感知这是"重掷成功但抽到同一条"）。
 */
function randomTrait(rng: Rng, exclude?: string): string {
  const pool = exclude ? DEF.traits.filter((t) => t.id !== exclude) : DEF.traits
  const use = pool.length > 0 ? pool : DEF.traits
  return use[randInt(rng, 0, use.length - 1)].id
}

/** 特质重掷（消耗徽记 + 金币） */
export function rerollTrait(state: GameState, companionId: string, rng: Rng, events: GameEvent[]): void {
  const st = state.companions[companionId]
  if (!st) {
    events.push({ type: 'blocked', reason: '伙伴不存在' })
    return
  }
  const cost = DEF.traitReroll
  if (materialCount(state, 'expedition_token') < cost.tokens) {
    events.push({ type: 'blocked', reason: `远征徽记不足（需要 ${cost.tokens}）` })
    return
  }
  if (state.gold < cost.gold) {
    events.push({ type: 'blocked', reason: `金币不足（需要 ${cost.gold}）` })
    return
  }
  removeMaterial(state, 'expedition_token', cost.tokens)
  addGold(state, -cost.gold)
  st.trait = randomTrait(rng, st.trait)
  events.push({ type: 'traitRerolled', name: companionDef(companionId).name, trait: st.trait })
}

export function bannerUpgradeCost(state: GameState): { tokens: number; gold: number } | null {
  const lv = state.meta.expeditions.banner
  if (lv >= DEF.banner.maxLevel) return null
  return DEF.banner.cost[lv]
}

export function upgradeBanner(state: GameState, events: GameEvent[]): void {
  const cost = bannerUpgradeCost(state)
  if (!cost) {
    events.push({ type: 'blocked', reason: '旗帜已满级' })
    return
  }
  if (materialCount(state, 'expedition_token') < cost.tokens) {
    events.push({ type: 'blocked', reason: `远征徽记不足（需要 ${cost.tokens}）` })
    return
  }
  if (state.gold < cost.gold) {
    events.push({ type: 'blocked', reason: `金币不足（需要 ${cost.gold}）` })
    return
  }
  removeMaterial(state, 'expedition_token', cost.tokens)
  addGold(state, -cost.gold)
  state.meta.expeditions.banner += 1
  events.push({ type: 'bannerUpgraded', level: state.meta.expeditions.banner })
}
