// ============================================================
// Forging · 赛季（v2.3）
// 设计：docs/design-v2.3.md §2.2「赛季状态硬规则」（评审 B3 处置）
//   1. 每季清零（renown/等级/任务随轮换重置；等级奖励因此每赛季可再领）
//   2. 每档**只计最高达成**（铜/银/金不叠加）
//   3. rewardedLevel 单调不回退（checkSeason 每 250ms 调用也不重复发奖）
//   4. 先结算旧赛季的达标与发奖，再轮换
//   5. 仅当 index > stored.index 才轮换（回拨时钟无效）；前拨只轮换一次
//   6. 门槛（总等级 < unlockTotalLevel）不初始化、不计进度
//   7. 不保留历史赛季
// 离线口径：挖掘/熔炼/锻造/金币/远征计数离线照常增长；
//   强化与重铸离线零增长（模板在 UI 标「需在线」）
// ============================================================
import { CONTENT } from './content'
import { totalLevelOf } from './expeditions'
import { addGold, addMaterial } from './state'
import type { GameEvent, GameState, SeasonSlot, SeasonTier, TaskCounter } from './types'

const DEF = CONTENT.season
const DAY_MS = 86_400_000
const SEASON_MS = DEF.days * DAY_MS

const TIERS: readonly SeasonTier[] = ['bronze', 'silver', 'gold']

/** 赛季序号：floor((now − epoch) / 14d)；now < epoch 时为负数（视为未开启） */
export function seasonIndex(now: number): number {
  return Math.floor((now - DEF.epoch) / SEASON_MS)
}

/** 当前赛季剩余毫秒 */
export function msToSeasonEnd(now: number): number {
  const idx = seasonIndex(now)
  return (idx + 1) * SEASON_MS + DEF.epoch - now
}

/** 确定性地从模板池抽取 3 条（同赛季所有玩家一致；不做随机，评审 B3-2 的可复现要求） */
export function pickSeasonTasks(index: number): SeasonSlot[] {
  const pool = DEF.templates
  const n = pool.length
  const picked: SeasonSlot[] = []
  // v2.3 测评 M3：原先只用 `index % n` 做步长 → 组合以 n 季为周期硬循环（去重仅 5 种）。
  // 改为对赛季序号做 32 位混合（xorshift）后逐条取样：组合充分展开，且仍完全可复现。
  let h = (index + 0x9e3779b9) >>> 0
  const next = (): number => {
    h ^= h << 13
    h >>>= 0
    h ^= h >>> 17
    h ^= h << 5
    h >>>= 0
    return h % n
  }
  let guard = 0
  while (picked.length < Math.min(3, n) && guard < 200) {
    guard++
    const id = pool[next()].id
    if (picked.some((p) => p.defId === id)) continue
    picked.push({ defId: id, base: 0 })
  }
  return picked
}

export function templateById(id: string) {
  return DEF.templates.find((t) => t.id === id)
}

/**
 * 赛季是否已解锁：总等级达门槛 **或** 曾经达成过（粘性）。
 * v2.3 测评 M2：传承会把技能重置到起点（总等级 ≈44 < 60），不粘性则终局玩家一传承赛季就消失。
 */
export function seasonUnlocked(state: GameState): boolean {
  if (state.meta.seasonUnlockedOnce) return true
  if (totalLevelOf(state) < DEF.unlockTotalLevel) return false
  state.meta.seasonUnlockedOnce = true // 首次达标即写死（传承不清）
  return true
}

function counterValue(state: GameState, counter: TaskCounter): number {
  return (state.stats as unknown as Record<string, number>)[counter] ?? 0
}

/** 单条任务的进度（相对赛季基线） */
export function seasonTaskProgress(state: GameState, slot: SeasonSlot): number {
  const tpl = templateById(slot.defId)
  if (!tpl) return 0
  return Math.max(0, counterValue(state, tpl.counter) - slot.base)
}

/** 已达成档位（-1 = 未达标） */
export function achievedTier(state: GameState, slot: SeasonSlot): number {
  const tpl = templateById(slot.defId)
  if (!tpl) return -1
  const v = seasonTaskProgress(state, slot)
  let best = -1
  for (let i = 0; i < tpl.targets.length; i++) if (v >= tpl.targets[i]) best = i
  return best
}

/** 声望 = 各任务「最高达成档」的声望之和（不叠加） */
export function seasonRenown(state: GameState): number {
  let sum = 0
  for (const slot of state.season.tasks) {
    const t = achievedTier(state, slot)
    if (t >= 0) sum += DEF.tierRenown[TIERS[t]]
  }
  return sum
}

export function levelForRenown(renown: number): number {
  return Math.min(DEF.levels, Math.floor(renown / DEF.renownPerLevel))
}

export function renownForLevel(level: number): number {
  return level * DEF.renownPerLevel
}

/** 某等级的奖励（即时发放） */
export function levelReward(level: number): { gold: number; essence: number; tokens: number } {
  const r = DEF.levelReward
  return {
    gold: r.goldBase + r.goldPerLevel * level,
    essence: r.essenceBase + Math.floor(level / 4),
    tokens: level >= DEF.levels ? r.maxLevelTokens : level % r.tokenEvery === 0 ? r.tokenAmount : 0,
  }
}

/**
 * 轮换：仅当前向（index > stored.index）且已解锁时执行（硬规则 5/6）。
 * 首次解锁时初始化（stored.index = -1 → 取当前赛季）。
 */
export function refreshSeason(state: GameState, now: number): GameEvent[] {
  const events: GameEvent[] = []
  if (!seasonUnlocked(state)) return events
  const idx = seasonIndex(now)
  if (idx < 0) return events
  if (state.season.index === idx) return events
  if (state.season.index >= 0 && idx < state.season.index) return events // 回拨：无效
  // 轮换（含首次初始化）：重取任务与基线，声望清零
  const tasks = pickSeasonTasks(idx)
  for (const slot of tasks) {
    const tpl = templateById(slot.defId)
    slot.base = tpl ? counterValue(state, tpl.counter) : 0
  }
  const rotated = state.season.index >= 0
  state.season = { index: idx, renown: 0, rewardedLevel: 0, tasks }
  if (rotated) events.push({ type: 'seasonRotated', index: idx })
  return events
}

/**
 * 结算：更新声望、按等级发奖（幂等）。
 * 调用点必须在 refreshSeason **之前**（硬规则 4：先结算旧赛季再轮换）。
 */
export function checkSeason(state: GameState): GameEvent[] {
  const events: GameEvent[] = []
  if (!seasonUnlocked(state) || state.season.index < 0) return events
  const renown = seasonRenown(state)
  state.season.renown = renown
  const level = levelForRenown(renown)
  for (let lv = state.season.rewardedLevel + 1; lv <= level; lv++) {
    const r = levelReward(lv)
    if (r.gold > 0) {
      addGold(state, r.gold)
      events.push({ type: 'goldGained', amount: r.gold })
    }
    if (r.essence > 0) {
      addMaterial(state, 'essence', r.essence)
      events.push({ type: 'itemsGained', items: [{ itemId: 'essence', qty: r.essence }] })
    }
    if (r.tokens > 0) {
      addMaterial(state, 'expedition_token', r.tokens)
      events.push({ type: 'itemsGained', items: [{ itemId: 'expedition_token', qty: r.tokens }] })
    }
    events.push({ type: 'seasonLevelUp', level: lv })
  }
  if (level > state.season.rewardedLevel) state.season.rewardedLevel = level
  return events
}

/** 赛季面板用摘要 */
export interface SeasonView {
  index: number
  renown: number
  maxRenown: number
  level: number
  maxLevel: number
  pct: number
  msLeft: number
  tasks: {
    defId: string
    title: string
    desc: string
    unit: string
    progress: number
    targets: [number, number, number]
    tier: number
    renown: number
    onlineOnly: boolean
  }[]
}

const ONLINE_ONLY_COUNTERS: readonly TaskCounter[] = ['totalEnhances', 'totalReforges']

export function seasonView(state: GameState, now: number): SeasonView {
  const slots = state.season.tasks.map((slot) => {
    const tpl = templateById(slot.defId)
    const tier = achievedTier(state, slot)
    return {
      defId: slot.defId,
      title: tpl?.title ?? slot.defId,
      desc: tpl?.desc ?? '',
      unit: tpl?.unit ?? '',
      progress: seasonTaskProgress(state, slot),
      targets: (tpl?.targets ?? [0, 0, 0]) as [number, number, number],
      tier,
      renown: tier >= 0 ? DEF.tierRenown[TIERS[tier]] : 0,
      onlineOnly: tpl ? ONLINE_ONLY_COUNTERS.includes(tpl.counter) : false,
    }
  })
  const renown = state.season.renown
  const level = levelForRenown(renown)
  return {
    index: state.season.index,
    renown,
    maxRenown: DEF.tierRenown.gold * slots.length,
    level,
    maxLevel: DEF.levels,
    pct: DEF.levels > 0 ? level / DEF.levels : 0,
    msLeft: msToSeasonEnd(now),
    tasks: slots,
  }
}

/** 便捷：当前赛季的档位名（UI 显示用） */
export function tierName(tier: number): string {
  return tier < 0 ? '未达成' : ['铜', '银', '金'][tier]
}
