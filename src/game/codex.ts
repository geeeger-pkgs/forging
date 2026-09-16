// ============================================================
// Forging · 图鉴（v2.3）
// 设计：docs/design-v2.3.md §2.1（评审 B5 处置：**源头登记**，不靠事后扫描）
//   - 登记点：state.addMaterial / state.addInstance（源头）→ 覆盖一切产出路径
//   - checkCodexMilestones：里程碑判定与发奖（幂等，主循环调用）
//   - checkCodexBackfill：老档冷启动回溯（仅载入时一次）
// 次序契约：产出/消耗 → checkCodexMilestones → sweepAutoRecycle
//   （否则 keep:0 的自动回收玩家，其采集物在扫描前就被卖掉了）
// ============================================================
import { CONTENT, itemDef } from './content'
import { codexFingerprint, emptyCodex, normalizeCodex, sectionCount, sectionIds, sectionTotal, setBit } from './codex-store'
import { addGold, addMaterial } from './state'
import type { CodexState, GameEvent, GameState, ItemId } from './types'

const DEF = CONTENT.season

// ---------------- 登记（源头调用；位图 O(1)） ----------------

/**
 * 取（必要时补）图鉴状态。
 *
 * **渲染期安全**：本函数会在**组件渲染**中被调用（`codexProgress`/`codexGate`/`milestoneReached`
 * 都走这里），因此正常路径必须是**纯读**——不能每次返回新对象，否则 Vue 会判定
 * "组件在渲染中修改自己的依赖"并无限重渲染（v3.0 实机走查实测：
 * `Maximum recursive updates exceeded in component <CodexPanel>`，图鉴面板计数卡住不更新）。
 * 只在**确实缺失/指纹不符**时才写一次状态。
 *
 * 指纹在模块加载时算一次即可（内容表是静态的），顺带消除"每次产出都重算指纹"的开销。
 */
const FP = codexFingerprint()

function ensure(state: GameState): CodexState {
  const cur = state.codex
  if (cur && typeof cur.bits === 'string') {
    if (cur.fp === FP) return cur // 正常路径：零写入
    const fixed = normalizeCodex(cur)
    state.codex = fixed
    return fixed
  }
  const fresh = emptyCodex()
  state.codex = fresh
  return fresh
}

/** 物品登记（材料/装备/符文/遗物；由 addMaterial / addInstance 调用） */
export function recordItem(state: GameState, itemId: ItemId): void {
  const codex = ensure(state)
  codex.bits = setBit(codex.bits, 'items', itemId)
}

/** 配方登记（制作成功时调用） */
export function recordRecipe(state: GameState, recipeId: string): void {
  const codex = ensure(state)
  codex.bits = setBit(codex.bits, 'recipes', recipeId)
}

/** 词缀登记（造装与重铸时调用） */
export function recordAffix(state: GameState, affixId: string): void {
  const codex = ensure(state)
  codex.bits = setBit(codex.bits, 'affixes', affixId)
}

/** 矿场登记（开采时调用） */
export function recordOre(state: GameState, siteId: string): void {
  const codex = ensure(state)
  codex.bits = setBit(codex.bits, 'ores', siteId)
}

// ---------------- 进度 ----------------

export interface CodexCategory {
  id: 'items' | 'recipes' | 'affixes' | 'companions' | 'relics' | 'ores'
  name: string
  found: number
  total: number
}

/** 图鉴称号（v3.0 L4）：四档里程碑各一个 */
export const CODEX_TITLES = ['初识万象', '博览群书', '格物致知', '万物归一']

/** 分区进度（UI 与成就共用）。v3.0：物品/配方/词缀/矿场来自**位图**，伙伴/遗物由状态推导。 */
export function codexProgress(state: GameState): { categories: CodexCategory[]; found: number; total: number; pct: number } {
  const codex = ensure(state)
  const relicIds = Object.keys(CONTENT.items).filter((id) => itemDef(id).category === 'relic')
  const relicIdsCollected = sectionIds(codex.bits, 'items')
  const relicFound = relicIds.filter((id) => relicIdsCollected.has(id)).length
  const itemsTotal = sectionTotal('items')
  const itemsFound = sectionCount(codex.bits, 'items')
  const relicTotal = relicIds.length
  const categories: CodexCategory[] = [
    { id: 'items', name: '物品（材料/装备/符文）', found: itemsFound - relicFound, total: itemsTotal - relicTotal },
    { id: 'recipes', name: '配方', found: sectionCount(codex.bits, 'recipes'), total: sectionTotal('recipes') },
    { id: 'affixes', name: '词缀', found: sectionCount(codex.bits, 'affixes'), total: sectionTotal('affixes') },
    { id: 'companions', name: '伙伴', found: Object.keys(state.companions).length, total: CONTENT.companions.companions.length },
    { id: 'relics', name: '遗物', found: relicFound, total: relicTotal },
    { id: 'ores', name: '矿场', found: sectionCount(codex.bits, 'ores'), total: sectionTotal('ores') },
  ]
  const found = categories.reduce((s, c) => s + c.found, 0)
  const total = categories.reduce((s, c) => s + c.total, 0)
  return { categories, found, total, pct: total > 0 ? found / total : 0 }
}

/**
 * 已登记的条目 id 集合（UI 展开用）。
 * v3.0：遗物与进度**同源**（都读位图）—— 修掉 v2.3"计数 3/3 但列表显示未收集"的口径分裂。
 */
export function codexIds(state: GameState, cat: CodexCategory['id']): Set<string> {
  if (cat === 'companions') return new Set(Object.keys(state.companions))
  const codex = ensure(state)
  if (cat === 'relics') {
    const all = sectionIds(codex.bits, 'items')
    return new Set(Object.keys(CONTENT.items).filter((id) => itemDef(id).category === 'relic' && all.has(id)))
  }
  return sectionIds(codex.bits, cat)
}

// ---------------- 里程碑（幂等） ----------------

export function codexMilestonesClaimed(state: GameState): Set<string> {
  return new Set((state.meta.codexMilestones ?? '').split(',').filter((x) => x.length > 0))
}

/** 检查并发放图鉴里程碑奖励（幂等；主循环/命令后调用） */
/** 某档的分区门槛是否全部达标（v3.0 §2.2c：每档都要在**每个分区**达标） */
export function milestoneReached(state: GameState, m: { req: Record<string, number> }): boolean {
  const cats = codexProgress(state).categories
  for (const [id, need] of Object.entries(m.req)) {
    const c = cats.find((x) => x.id === id)
    if (!c || c.total <= 0) continue
    if (c.found / c.total + 1e-9 < need) return false
  }
  return true
}

/** 当前档位所需的**最接近达标**的分区（面板提示"还差哪个区"用） */
export function codexGate(state: GameState): { next: { pct: number; title: string } | null; shortfall: { id: string; name: string; found: number; need: number }[] } {
  const claimed = codexMilestonesClaimed(state)
  const cats = codexProgress(state).categories
  const next = DEF.codexMilestones.find((m) => !claimed.has(String(m.pct)))
  if (!next) return { next: null, shortfall: [] }
  const shortfall = Object.entries(next.req)
    .map(([id, need]) => {
      const c = cats.find((x) => x.id === id)
      const want = Math.ceil((c?.total ?? 0) * need)
      return { id, name: c?.name ?? id, found: c?.found ?? 0, need: want }
    })
    .filter((x) => x.found < x.need)
  return { next: { pct: next.pct, title: next.title }, shortfall }
}

export function checkCodexMilestones(state: GameState): GameEvent[] {
  const events: GameEvent[] = []
  const claimed = codexMilestonesClaimed(state)
  for (const m of DEF.codexMilestones) {
    const key = String(m.pct)
    if (claimed.has(key) || !milestoneReached(state, m)) continue
    claimed.add(key)
    state.meta.codexMilestones = [...claimed].join(',')
    if (m.gold > 0) {
      addGold(state, m.gold)
      events.push({ type: 'goldGained', amount: m.gold })
    }
    if (m.essence > 0) {
      addMaterial(state, 'essence', m.essence)
      events.push({ type: 'itemsGained', items: [{ itemId: 'essence', qty: m.essence }] })
    }
    if (m.tokens > 0) {
      addMaterial(state, 'expedition_token', m.tokens)
      events.push({ type: 'itemsGained', items: [{ itemId: 'expedition_token', qty: m.tokens }] })
    }
    events.push({ type: 'codexMilestone', pct: m.pct, gold: m.gold, title: m.title })
  }
  return events
}

/**
 * 冷启动回溯（老档载入一次）：把**当前仍持有**的物品/装备/伙伴/遗物登记进图鉴。
 * 设计与实现一致地承认：已消耗的材料、已回收的装备、以及历史配方/词缀**无法回溯**。
 */
export function checkCodexBackfill(state: GameState): void {
  for (const [id, qty] of Object.entries(state.materials)) if (qty > 0) recordItem(state, id)
  for (const inst of state.equipment) {
    recordItem(state, inst.itemId)
    for (const a of inst.affixes ?? []) recordAffix(state, a.id)
  }
}

/** 仅用于测试与调试：清空图鉴 */
export function resetCodex(state: GameState): void {
  state.codex = emptyCodex()
  state.meta.codexMilestones = ''
}
