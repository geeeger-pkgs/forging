// ============================================================
// Forging · 事件 → 表现映射（v2.5，**纯模块**）
// 设计：docs/design-v2.5.md §2.2
//
// 为什么单独成模块（评审 B1）：`store.ts` 依赖 window（node 测试下导入即抛错），
// 而映射规则必须能被 node 测试**穷举**；因此这里不碰 DOM、不碰 store、不碰音频引擎。
// store.handleEvents 只做薄适配：把 FxPlan 交给 playCue / 场景层 / 飘字层。
// ============================================================
import type { FxLevel, FxSetting, GameEvent } from '../game/types'

/**
 * 爆发色系。
 * - 事件侧（resolveFx）只产出 `spark|gold|gray|blue|abyss`；
 * - `ore` 由**场景本体**发起（动作完成时按技能选色），不属于事件映射。
 */
export type BurstKind = 'spark' | 'gold' | 'gray' | 'blue' | 'abyss' | 'ore'

/**
 * 系统「减少动态效果」偏好。
 * v3.0 §2.5：**缓存 MediaQueryList 对象**而不是每次调用 matchMedia ——
 * 后者每次都会新建 MQL（实机实测把 tick 的 p95 顶到 0.70ms）。
 * 缓存对象后其 matches 仍是实时值（用户在系统里改偏好无需重载即生效）。
 */
let mql: { matches: boolean } | null | undefined
function prefersReducedMotion(): boolean {
  if (mql === undefined) {
    const w = globalThis as unknown as { matchMedia?: (q: string) => { matches: boolean } }
    try {
      mql = typeof w.matchMedia === 'function' ? w.matchMedia('(prefers-reduced-motion: reduce)') : null
    } catch {
      mql = null
    }
  }
  return mql ? mql.matches : false
}

/** 仅测试用：清掉 MQL 缓存（模拟环境变化） */
export function __resetMatchMediaCache(): void {
  mql = undefined
}

/**
 * 动效档位解析（设计 §2.5）：auto 跟随系统「减少动态效果」偏好，用户显式档位优先。
 * 放在纯模块里（不在 store）以便 node 测试直接断言 —— store.ts 在 node 下导入即抛错。
 */
export function resolveFxLevel(fx: FxSetting | undefined): FxLevel {
  if (fx === 'full' || fx === 'reduced' || fx === 'off') return fx
  return prefersReducedMotion() ? 'reduced' : 'full'
}

export interface FxPlan {
  cue?: string
  burst?: BurstKind
  ring?: boolean
  popup?: { text: string; kind: 'item' | 'xp' | 'gold' }
}

export interface FxContext {
  itemName: (id: string) => string
  /** 稀有物品判定（精华/小箱/重铸石/徽记/遗物） */
  isRare: (id: string) => boolean
  /** 词缀/技能等可读名（用于飘字） */
  skillName: (id: string) => string
}

/**
 * 千分位数字（不依赖 toLocaleString）。
 * `toLocaleString` 每次调用都要走 ICU，实测是表现层映射里最贵的一步
 * （烟测 R3：主循环 P95 0.6ms 里的主要构成）；这里退化为纯字符串分组，行为等价且快一个量级。
 */
function n(x: number): string {
  const v = Math.round(x)
  const neg = v < 0
  const s = String(Math.abs(v))
  let out = ''
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += ','
    out += s[i]
  }
  return neg ? `-${out}` : out
}

/**
 * 单个事件的表现计划。
 * **契约**：GameEvent 的每个成员都必须在此处理（无表现的显式返回 null），由 F1 穷举守护。
 */
export function resolveFx(ev: GameEvent, ctx: FxContext): FxPlan | null {
  switch (ev.type) {
    // ---- 动作 ----
    case 'actionStarted':
      return { cue: 'actionStart' }
    case 'actionCompleted':
      return { cue: 'actionComplete', burst: 'spark' }
    case 'actionStopped':
      return null
    case 'itemsGained': {
      const rare = ev.items.some((it) => ctx.isRare(it.itemId))
      const text = ev.items.map((it) => `+${n(it.qty)} ${ctx.itemName(it.itemId)}`).join(' ')
      return { cue: rare ? 'rareDrop' : undefined, popup: { text, kind: 'item' }, burst: rare ? 'gold' : undefined }
    }
    case 'xpGained':
      return { popup: { text: `+${n(ev.xp)} XP`, kind: 'xp' } }
    case 'goldGained':
      // 评审 B2：支出与收入必须分开（负数走购买音，正数只飘字）
      return ev.amount < 0
        ? { cue: 'purchase' }
        : { popup: { text: `+${n(ev.amount)} 金`, kind: 'gold' } }

    // ---- 成长 ----
    case 'levelUp':
      return { cue: 'levelUp', ring: true, popup: { text: `${ctx.skillName(ev.skill)} → Lv${ev.level}`, kind: 'xp' } }
    case 'prestigeDone':
      return { cue: 'prestige', ring: true }
    case 'perkChanged':
      return { cue: 'purchase' }
    case 'seasonLevelUp':
      return { cue: 'seasonLevel', ring: true }
    case 'seasonRotated':
      return null
    case 'codexMilestone':
      return { cue: 'achievement', ring: true }
    case 'companionLevelUp':
      return { cue: 'levelUp' }
    case 'companionRecruited':
      return { cue: 'levelUp', ring: true }
    case 'traitRerolled':
      return { cue: 'purchase' }

    // ---- 锻造 ----
    case 'enhanceResult': {
      // 评审 B2：三分支必须区分
      if (ev.guarded) return { cue: 'enhanceGuarded', burst: 'blue' }
      if (ev.success) return { cue: 'enhanceSuccess', burst: 'gold' }
      return { cue: 'enhanceFail', burst: 'gray' }
    }
    case 'reforged':
      return { cue: 'enhanceSuccess', burst: 'spark' }

    // ---- 收获 ----
    case 'crateOpened': {
      const big = ev.text.includes('大奖')
      return { cue: big ? 'lootBig' : 'crateOpen', burst: big ? 'gold' : 'spark', popup: { text: ev.text, kind: 'item' } }
    }
    case 'buffActivated':
      return { cue: 'lootBig', ring: true }

    // ---- 系统 ----
    case 'taskCompleted':
      return { cue: 'taskComplete', ring: true }
    case 'tasksRotated':
      return null
    case 'achievementUnlocked':
      return { cue: 'achievement', ring: true }
    case 'tutorialGoalMet':
      return { cue: 'taskComplete' }
    case 'tutorialRewarded':
      return { cue: 'purchase' }
    case 'blocked':
      return { cue: 'blocked' }
    case 'notice':
      return null

    // ---- 远征 / 伙伴 ----
    case 'expeditionDispatched':
      return { cue: 'actionStart' }
    case 'expeditionDone':
      return { cue: 'taskComplete' }
    case 'expeditionClaimed':
      return { cue: 'purchase', popup: { text: `+${n(ev.gold)} 金`, kind: 'gold' } }
    case 'bannerUpgraded':
      return { cue: 'achievement', ring: true }

    // ---- 深渊 ----
    case 'abyssCleared':
      return { cue: 'abyssClear', burst: 'abyss', ring: true, popup: { text: `第 ${ev.floor} 层 +${n(ev.crystals)} 结晶`, kind: 'item' } }
    case 'abyssSwept':
      return { cue: 'actionComplete', popup: { text: `+${n(ev.crystals)} 结晶`, kind: 'item' } }
    case 'abyssItemBought':
      return { cue: 'purchase', ring: true }

    // ---- 预设 / 设置 ----
    case 'loadoutApplied':
      return { cue: 'actionStart' }
    case 'settingsChanged':
      // 设置本身不发声（避免"关音效"时反而响一下）；壳层另行同步音频引擎
      return null

    default:
      // 穷举守护：若新增事件类型而未在此处理，TypeScript 会在编译期报错（never 检查）
      return assertNever(ev)
  }
}

/** 编译期穷举检查：任何未处理的 GameEvent 成员都会让这里报错 */
function assertNever(ev: never): never {
  throw new Error(`resolveFx 未处理的事件类型: ${JSON.stringify(ev)}`)
}
