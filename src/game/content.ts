// ============================================================
// Forging · 内容表载入与校验（内核）
// 载入 data/*.json → 结构校验 → 交叉引用校验 → 导出强类型 CONTENT
// 校验失败直接 throw（启动即失败，避免脏数据流入运行时）
// ============================================================
import type { ContentTables, ItemDef, ItemId, RuneDef, SkillId, SlotId, TaskCounter } from './types'

import skillsJson from '../../data/skills.json'
import oresJson from '../../data/ores.json'
import itemsJson from '../../data/items.json'
import recipesJson from '../../data/recipes.json'
import levelCurveJson from '../../data/levelCurve.json'
import enhanceJson from '../../data/enhance.json'
import tutorialJson from '../../data/tutorial.json'
import achievementsJson from '../../data/achievements.json'
import tasksJson from '../../data/tasks.json'
import runesJson from '../../data/runes.json'
import configJson from '../../data/config.json'

const SKILL_IDS: readonly SkillId[] = ['mining', 'smelting', 'forging', 'enhancing']
const SLOT_IDS: readonly SlotId[] = [
  'pick',
  'crucible',
  'hammer',
  'mainHand',
  'head',
  'body',
  'legs',
  'feet',
  'necklace',
  'ring',
]
const EQUIP_CATEGORIES = new Set(['tool', 'weapon', 'armor', 'jewelry'])
const RUNE_EFFECTS = new Set(['speed', 'efficiency', 'rareFind', 'enhanceRate'])
const TASK_COUNTERS: readonly TaskCounter[] = [
  'totalMines',
  'totalSmelts',
  'totalForges',
  'totalCrafts',
  'totalEnhances',
  'totalGoldEarned',
  'totalCratesOpened',
  'totalJewelryForged',
  'totalRunesCrafted',
]

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

  // 成就（v1.1 / v1.3 / v1.4）
  const achIds = new Set<string>()
  for (const a of t.achievements) {
    if (achIds.has(a.id)) errs.push(`成就 id 重复: ${a.id}`)
    achIds.add(a.id)
    if (a.target <= 0) errs.push(`成就目标非法: ${a.id}`)
    if (a.type === 'skillLevel' && (!a.skill || !SKILL_IDS.includes(a.skill))) errs.push(`成就技能非法: ${a.id}`)
    if (a.type === 'itemCount' && (!a.itemId || !hasItem(a.itemId))) errs.push(`成就物品不存在: ${a.id}`)
    if (a.type === 'stat' && !a.stat) errs.push(`成就缺少计数器: ${a.id}`)
    for (const rw of a.rewards) {
      if (rw.itemId && !hasItem(rw.itemId)) errs.push(`成就奖励物品不存在: ${a.id} -> ${rw.itemId}`)
      if (!rw.gold && !rw.itemId) errs.push(`成就奖励为空: ${a.id}`)
    }
  }

  // 任务（v1.2）
  const taskIds = new Set<string>()
  for (const task of t.tasks.daily) {
    if (taskIds.has(task.id)) errs.push(`任务 id 重复: ${task.id}`)
    taskIds.add(task.id)
    if (!TASK_COUNTERS.includes(task.counter)) errs.push(`任务计数器非法: ${task.id} -> ${task.counter}`)
    for (const arr of [task.targets, task.gold, task.essence, task.crates]) {
      if (!Array.isArray(arr) || arr.length !== 3) errs.push(`任务难度数组非法: ${task.id}`)
    }
    if (task.targets.some((n) => n <= 0)) errs.push(`任务目标非法: ${task.id}`)
  }
  for (const task of t.tasks.weekly) {
    if (taskIds.has(task.id)) errs.push(`任务 id 重复: ${task.id}`)
    taskIds.add(task.id)
    if (!TASK_COUNTERS.includes(task.counter)) errs.push(`任务计数器非法: ${task.id} -> ${task.counter}`)
    if (task.target <= 0) errs.push(`任务目标非法: ${task.id}`)
  }

  // 符文（v1.4）
  const runeIds = new Set<string>()
  for (const r of t.runes) {
    if (runeIds.has(r.id)) errs.push(`符文 id 重复: ${r.id}`)
    runeIds.add(r.id)
    if (!hasItem(r.id)) errs.push(`符文物品不存在: ${r.id}`)
    if (!RUNE_EFFECTS.has(r.effect)) errs.push(`符文效果非法: ${r.id} -> ${r.effect}`)
    if (!(r.value > 0)) errs.push(`符文数值非法: ${r.id}`)
    if (r.durationMs <= 0) errs.push(`符文时长非法: ${r.id}`)
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
  achievements: achievementsJson,
  tasks: tasksJson,
  runes: runesJson,
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
export const TASK_DAILY_BY_ID = new Map(CONTENT.tasks.daily.map((t) => [t.id, t] as const))
export const TASK_WEEKLY_BY_ID = new Map(CONTENT.tasks.weekly.map((t) => [t.id, t] as const))
export const RUNE_BY_ID: ReadonlyMap<ItemId, RuneDef> = new Map(CONTENT.runes.map((r) => [r.id, r] as const))
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
