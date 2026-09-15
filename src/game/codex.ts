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
import { addGold, addMaterial } from './state'
import type { GameEvent, GameState, ItemId } from './types'

const DEF = CONTENT.season

// ---------------- 登记（源头调用，O(1) 字符串包含判断） ----------------

function addId(store: string, id: string): string {
  return store.length === 0 ? id : `${store},${id}`
}

function hasId(store: string, id: string): boolean {
  return store === id || store.startsWith(`${id},`) || store.endsWith(`,${id}`) || store.includes(`,${id},`)
}

/** 物品登记（材料/装备/符文/遗物；由 addMaterial / addInstance 调用） */
export function recordItem(state: GameState, itemId: ItemId): void {
  const codex = state.codex
  if (!codex || hasId(codex.items, itemId)) return
  codex.items = addId(codex.items, itemId)
}

/** 配方登记（制作成功时调用） */
export function recordRecipe(state: GameState, recipeId: string): void {
  const codex = state.codex
  if (!codex || hasId(codex.recipes, recipeId)) return
  codex.recipes = addId(codex.recipes, recipeId)
}

/** 词缀登记（造装与重铸时调用） */
export function recordAffix(state: GameState, affixId: string): void {
  const codex = state.codex
  if (!codex || hasId(codex.affixes, affixId)) return
  codex.affixes = addId(codex.affixes, affixId)
}

/** 矿场登记（开采时调用） */
export function recordOre(state: GameState, siteId: string): void {
  const codex = state.codex
  if (!codex || hasId(codex.ores, siteId)) return
  codex.ores = addId(codex.ores, siteId)
}

// ---------------- 进度 ----------------

export interface CodexCategory {
  id: 'items' | 'recipes' | 'affixes' | 'companions' | 'relics' | 'ores'
  name: string
  found: number
  total: number
}

function countIds(store: string): number {
  if (!store) return 0
  return store.split(',').filter((x) => x.length > 0).length
}

/** 分区进度（UI 与成就共用） */
export function codexProgress(state: GameState): { categories: CodexCategory[]; found: number; total: number; pct: number } {
  const relicIds = Object.keys(CONTENT.items).filter((id) => itemDef(id).category === 'relic')
  const relicFound = relicIds.filter((id) => (state.materials[id] ?? 0) > 0 || hasId(state.codex.items, id)).length
  const categories: CodexCategory[] = [
    {
      id: 'items',
      name: '物品（材料/装备/符文）',
      found: countIds(
        state.codex.items
          .split(',')
          .filter((id) => id.length > 0 && itemDef(id).category !== 'relic')
          .join(','),
      ),
      total: Object.keys(CONTENT.items).filter((id) => itemDef(id).category !== 'relic').length,
    },
    { id: 'recipes', name: '配方', found: countIds(state.codex.recipes), total: CONTENT.recipes.length },
    { id: 'affixes', name: '词缀', found: countIds(state.codex.affixes), total: CONTENT.affixes.affixes.length },
    { id: 'companions', name: '伙伴', found: Object.keys(state.companions).length, total: CONTENT.companions.companions.length },
    { id: 'relics', name: '遗物', found: relicFound, total: relicIds.length },
    { id: 'ores', name: '矿场', found: countIds(state.codex.ores), total: CONTENT.ores.length },
  ]
  const found = categories.reduce((s, c) => s + c.found, 0)
  const total = categories.reduce((s, c) => s + c.total, 0)
  return { categories, found, total, pct: total > 0 ? found / total : 0 }
}

/** 已登记的条目 id 集合（UI 展开用） */
export function codexIds(state: GameState, cat: CodexCategory['id']): Set<string> {
  if (cat === 'companions') return new Set(Object.keys(state.companions))
  if (cat === 'relics') {
    return new Set(Object.keys(CONTENT.items).filter((id) => itemDef(id).category === 'relic' && (state.materials[id] ?? 0) > 0))
  }
  const store = cat === 'items' ? state.codex.items : cat === 'recipes' ? state.codex.recipes : cat === 'affixes' ? state.codex.affixes : state.codex.ores
  return new Set(store.split(',').filter((x) => x.length > 0))
}

// ---------------- 里程碑（幂等） ----------------

export function codexMilestonesClaimed(state: GameState): Set<string> {
  return new Set((state.meta.codexMilestones ?? '').split(',').filter((x) => x.length > 0))
}

/** 检查并发放图鉴里程碑奖励（幂等；主循环/命令后调用） */
export function checkCodexMilestones(state: GameState): GameEvent[] {
  const events: GameEvent[] = []
  const { pct } = codexProgress(state)
  const claimed = codexMilestonesClaimed(state)
  for (const m of DEF.codexMilestones) {
    const key = String(m.pct)
    if (claimed.has(key) || pct < m.pct) continue
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
    events.push({ type: 'codexMilestone', pct: m.pct, gold: m.gold })
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
  state.codex = { items: '', recipes: '', affixes: '', ores: '' }
  state.meta.codexMilestones = ''
}
