// ============================================================
// Forging · 内容表载入与校验（内核）
// 载入 data/*.json → 结构校验 → 交叉引用校验 → 导出强类型 CONTENT
// 校验失败直接 throw（启动即失败，避免脏数据流入运行时）
// ============================================================
import type { ContentTables, ItemDef, ItemId, SkillId, SlotId } from './types'

import skillsJson from '../../data/skills.json'
import oresJson from '../../data/ores.json'
import itemsJson from '../../data/items.json'
import recipesJson from '../../data/recipes.json'
import levelCurveJson from '../../data/levelCurve.json'
import enhanceJson from '../../data/enhance.json'
import tutorialJson from '../../data/tutorial.json'
import configJson from '../../data/config.json'

const SKILL_IDS: readonly SkillId[] = ['mining', 'smelting', 'forging', 'enhancing']
const SLOT_IDS: readonly SlotId[] = ['pick', 'crucible', 'hammer', 'mainHand', 'head', 'body', 'legs', 'feet']
const EQUIP_CATEGORIES = new Set(['tool', 'weapon', 'armor'])

function validate(t: ContentTables): string[] {
  const errs: string[] = []
  const hasItem = (id: string): boolean => Boolean(t.items[id])

  // 技能
  const skillIds = new Set(t.skills.map((s) => s.id))
  for (const s of SKILL_IDS) if (!skillIds.has(s)) errs.push(`skills.json 缺技能: ${s}`)

  // 物品
  for (const [id, def] of Object.entries(t.items)) {
    if (def.id !== id) errs.push(`items.json 键值不一致: ${id} vs ${def.id}`)
    if (!(def.value >= 0)) errs.push(`物品价值非法: ${id}`)
    if (EQUIP_CATEGORIES.has(def.category)) {
      if (!def.slot || !SLOT_IDS.includes(def.slot)) errs.push(`装备缺槽位或槽位非法: ${id}`)
      if (!def.enhanceable) errs.push(`装备应可强化: ${id}`)
    }
  }

  // 矿场
  for (const s of t.ores) {
    if (!hasItem(s.outputItemId)) errs.push(`矿场产出物品不存在: ${s.id} -> ${s.outputItemId}`)
    if (s.yieldMin < 1 || s.yieldMax < s.yieldMin) errs.push(`矿场产量非法: ${s.id}`)
    if (s.baseTimeMs <= 0) errs.push(`矿场时间非法: ${s.id}`)
    for (const rd of s.rareDrops) if (!hasItem(rd.itemId)) errs.push(`矿场掉落物品不存在: ${s.id} -> ${rd.itemId}`)
  }

  // 配方
  for (const r of t.recipes) {
    if (!SKILL_IDS.includes(r.skill)) errs.push(`配方技能非法: ${r.id}`)
    if (r.inputs.length === 0) errs.push(`配方无输入: ${r.id}`)
    if (r.outputs.length === 0) errs.push(`配方无输出: ${r.id}`)
    for (const io of [...r.inputs, ...r.outputs]) {
      if (!hasItem(io.itemId)) errs.push(`配方引用物品不存在: ${r.id} -> ${io.itemId}`)
      if (io.qty <= 0) errs.push(`配方数量非法: ${r.id} -> ${io.itemId}`)
    }
    for (const rd of r.rareDrops) if (!hasItem(rd.itemId)) errs.push(`配方掉落物品不存在: ${r.id} -> ${rd.itemId}`)
    if (r.xp < 0 || r.baseTimeMs <= 0) errs.push(`配方数值非法: ${r.id}`)
  }

  // 强化：1..10 连续
  const levels = t.enhance.map((e) => e.targetLevel).sort((a, b) => a - b)
  for (let i = 1; i <= 10; i++) if (levels[i - 1] !== i) errs.push(`强化档位缺失: +${i}`)
  for (const e of t.enhance) {
    if (e.successRate <= 0 || e.successRate > 1) errs.push(`强化成功率非法: +${e.targetLevel}`)
    if (e.cost.ingots < 0 || e.cost.essences < 0) errs.push(`强化消耗非法: +${e.targetLevel}`)
  }

  // 教程：步骤连续
  const steps = t.tutorial.map((s) => s.step).sort((a, b) => a - b)
  for (let i = 1; i <= t.tutorial.length; i++) if (steps[i - 1] !== i) errs.push(`教程步骤不连续: ${i}`)
  for (const s of t.tutorial) {
    if (s.goal.itemId && !hasItem(s.goal.itemId)) errs.push(`教程目标物品不存在: 步骤 ${s.step}`)
    if (s.goal.slotId && !SLOT_IDS.includes(s.goal.slotId)) errs.push(`教程目标槽位非法: 步骤 ${s.step}`)
    for (const rw of s.rewards) if (rw.itemId && !hasItem(rw.itemId)) errs.push(`教程奖励物品不存在: 步骤 ${s.step}`)
  }

  // 曲线与配置
  if (t.levelCurve.baseXp <= 0) errs.push('levelCurve.baseXp 非法')
  for (let i = 1; i < t.levelCurve.bands.length; i++) {
    if (t.levelCurve.bands[i].fromLevel <= t.levelCurve.bands[i - 1].fromLevel) errs.push('levelCurve 分段必须递增')
  }
  if (t.config.minActionTimeMs <= 0 || t.config.offlineCapHours <= 0) errs.push('config 数值非法')

  return errs
}

export const CONTENT: ContentTables = {
  skills: skillsJson,
  ores: oresJson,
  items: itemsJson,
  recipes: recipesJson,
  levelCurve: levelCurveJson,
  enhance: enhanceJson,
  tutorial: tutorialJson,
  config: configJson,
} as unknown as ContentTables

{
  const errs = validate(CONTENT)
  if (errs.length > 0) throw new Error('内容表校验失败:\n- ' + errs.join('\n- '))
}

// ---------- 索引与查询（启动后只读） ----------

export const SITES_BY_ID = new Map(CONTENT.ores.map((s) => [s.id, s] as const))
export const RECIPES_BY_ID = new Map(CONTENT.recipes.map((r) => [r.id, r] as const))
export const ENHANCE_BY_TARGET = new Map(CONTENT.enhance.map((e) => [e.targetLevel, e] as const))
export const TUTORIAL_BY_STEP = new Map(CONTENT.tutorial.map((s) => [s.step, s] as const))
export const MAX_LEVEL = Math.max(...CONTENT.skills.map((s) => s.maxLevel))
export const MAX_ENHANCE = Math.max(...CONTENT.enhance.map((e) => e.targetLevel))

export function itemDef(id: ItemId): ItemDef {
  const def = CONTENT.items[id]
  if (!def) throw new Error(`未知道具: ${id}`)
  return def
}

export function skillName(id: SkillId): string {
  const s = CONTENT.skills.find((x) => x.id === id)
  if (!s) throw new Error(`未知技能: ${id}`)
  return s.name
}

/** 同级锭 itemId（用于强化消耗解析） */
export function ingotIdForTier(tier: 1 | 2 | 3 | 4 | 5): ItemId {
  const suffix = { 1: 'copper', 2: 'iron', 3: 'silver', 4: 'gold', 5: 'mithril' }[tier]
  return `ingot_${suffix}`
}
