// ============================================================
// Forging · 内容表载入与校验（内核）
// 载入 data/*.json → 结构校验 → 交叉引用校验 → 导出强类型 CONTENT
// 校验失败直接 throw（启动即失败，避免脏数据流入运行时）
// ============================================================
import type {
  AffixArchetype,
  AffixDef,
  AffixEffect,
  ContentTables,
  ItemDef,
  ItemId,
  PerkEffect,
  RuneDef,
  SkillId,
  SlotId,
  TaskCounter,
  Tier,
  CompanionDef,
  ExpeditionRouteDef,
  TraitDef,
} from './types'

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
import perksJson from '../../data/perks.json'
import affixesJson from '../../data/affixes.json'
import companionsJson from '../../data/companions.json'
import expeditionsJson from '../../data/expeditions.json'
import seasonJson from '../../data/season.json'
import abyssJson from '../../data/abyss.json'
import fxJson from '../../data/fx.json'
import goldShopJson from '../../data/goldShop.json'
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
const PERK_EFFECTS: readonly PerkEffect[] = ['speed', 'wisdom', 'efficiency', 'rareFind', 'offlineHours', 'startLevel']
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
  'totalReforges',
  'totalExpeditions',
  // v3.1：T4+ 口径（赛季"强化/重铸"目标）
  'totalEnhancesT4',
  'totalReforgesT4',
]

const AFFIX_EFFECTS: readonly AffixEffect[] = [
  'speed',
  'quantity',
  'efficiency',
  'wisdom',
  'rareFind',
  'enhanceRate',
  'guard',
  'goldFind',
  'stoneFind',
]
const ARCHETYPES: readonly AffixArchetype[] = ['tool', 'weapon', 'armor', 'jewelry']

/** 内容表校验（导出供测试做负例验证；返回错误清单，空数组 = 通过） */
export function validateContent(t: ContentTables): string[] {
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
  // v3.1：教程目标类型白名单 + 新类型必填字段（章节二）
  const TUTORIAL_GOAL_TYPES = ['mineItem', 'craftItem', 'equipSlot', 'enhanceInstance', 'totalLevel', 'stat', 'abyssFloor', 'codexPct', 'seasonLevel']
  for (const s of t.tutorial) {
    const g = s.goal as { type: string; itemId?: string; slotId?: string; counter?: string; target: number }
    if (!TUTORIAL_GOAL_TYPES.includes(g.type)) errs.push(`教程目标类型非法: 步骤 ${s.step} -> ${g.type}`)
    if (!(g.target > 0)) errs.push(`教程目标数值非法: 步骤 ${s.step}`)
    if (g.itemId && !hasItem(g.itemId)) errs.push(`教程目标物品不存在: 步骤 ${s.step}`)
    if (g.slotId && !(SLOT_IDS as readonly string[]).includes(g.slotId)) errs.push(`教程目标槽位非法: 步骤 ${s.step}`)
    if (g.type === 'stat' && !TASK_COUNTERS.includes(g.counter as never)) {
      errs.push(`教程 stat 计数器非法: 步骤 ${s.step} -> ${g.counter}`)
    }
    if (g.type === 'codexPct' && !(g.target > 0 && g.target <= 1)) errs.push(`教程图鉴比例越界: 步骤 ${s.step}`)
    for (const rw of s.rewards) if (rw.itemId && !hasItem(rw.itemId)) errs.push(`教程奖励物品不存在: 步骤 ${s.step}`)
  }

  // 成就
  const achIds = new Set<string>()
  for (const a of t.achievements) {
    if (achIds.has(a.id)) errs.push(`成就 id 重复: ${a.id}`)
    achIds.add(a.id)
    if (a.target <= 0) errs.push(`成就目标非法: ${a.id}`)
    if (a.type === 'skillLevel' && (!a.skill || !SKILL_IDS.includes(a.skill))) errs.push(`成就技能非法: ${a.id}`)
    if (a.type === 'itemCount' && (!a.itemId || !hasItem(a.itemId))) errs.push(`成就物品不存在: ${a.id}`)
    if (a.type === 'stat' && !a.stat) errs.push(`成就缺少计数器: ${a.id}`)
    if (a.type === 'companionRarity' && !a.rarity) errs.push(`成就缺少稀有度: ${a.id}`)
    for (const rw of a.rewards) {
      if (rw.itemId && !hasItem(rw.itemId)) errs.push(`成就奖励物品不存在: ${a.id} -> ${rw.itemId}`)
      if (!rw.gold && !rw.itemId) errs.push(`成就奖励为空: ${a.id}`)
    }
  }

  // 任务
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

  // 符文
  const runeIds = new Set<string>()
  for (const r of t.runes) {
    if (runeIds.has(r.id)) errs.push(`符文 id 重复: ${r.id}`)
    runeIds.add(r.id)
    if (!hasItem(r.id)) errs.push(`符文物品不存在: ${r.id}`)
    if (!RUNE_EFFECTS.has(r.effect)) errs.push(`符文效果非法: ${r.id} -> ${r.effect}`)
    if (!(r.value > 0)) errs.push(`符文数值非法: ${r.id}`)
    if (r.durationMs <= 0) errs.push(`符文时长非法: ${r.id}`)
  }

  // 精通（v1.5）
  const perkIds = new Set<string>()
  for (const p of t.perks) {
    if (perkIds.has(p.id)) errs.push(`精通 id 重复: ${p.id}`)
    perkIds.add(p.id)
    if (!PERK_EFFECTS.includes(p.effect)) errs.push(`精通效果非法: ${p.id} -> ${p.effect}`)
    if (!(p.perPoint > 0)) errs.push(`精通数值非法: ${p.id}`)
    if (p.max <= 0 || p.cost <= 0) errs.push(`精通配置非法: ${p.id}`)
  }

  // 词缀（v2.1）
  const affixIds = new Set<string>()
  for (const a of t.affixes.affixes) {
    if (affixIds.has(a.id)) errs.push(`词缀 id 重复: ${a.id}`)
    affixIds.add(a.id)
    if (!AFFIX_EFFECTS.includes(a.effect)) errs.push(`词缀效果非法: ${a.id} -> ${a.effect}`)
    if (!(a.base > 0) || !(a.perTier >= 0)) errs.push(`词缀数值非法: ${a.id}`)
    // v2.1 评审 B1：词缀必须在游戏内可读（缺说明会导致玩家不知道自己在追什么）
    if (!a.desc || a.desc.trim().length < 4) errs.push(`词缀缺少效果说明: ${a.id}`)
  }
  for (const arch of ARCHETYPES) {
    const pool = t.affixes.pools[arch]
    if (!Array.isArray(pool) || pool.length === 0) {
      errs.push(`词缀池缺失或为空: ${arch}`)
      continue
    }
    if (new Set(pool).size !== pool.length) errs.push(`词缀池内有重复: ${arch}`)
    for (const id of pool) if (!affixIds.has(id)) errs.push(`词缀池引用不存在的词缀: ${arch} -> ${id}`)
  }
  const maxTier = Math.max(...Object.values(t.items).map((d) => d.tier ?? 0))
  const poolSize = Math.min(...ARCHETYPES.map((a) => (t.affixes.pools[a] ?? []).length))
  for (let tier = 1; tier <= maxTier; tier++) {
    const n = t.affixes.countByTier[String(tier)]
    if (!Number.isInteger(n) || n < 1) errs.push(`词缀条数缺失或非法: T${tier}`)
    else if (n > poolSize) errs.push(`词缀条数超出最小池容量: T${tier} -> ${n} > ${poolSize}`)
    // 评审 M4：条数等于池大小时组合退化为 1 种 → 至少留 1 条余量
    else if (n === poolSize) errs.push(`词缀条数等于池容量，组合退化: T${tier} -> ${n}（需池 > 条数）`)
  }
  if (!(t.affixes.rollMin > 0) || !(t.affixes.rollMax >= t.affixes.rollMin)) errs.push('词缀 roll 区间非法')
  if (!(t.affixes.perfectThreshold > t.affixes.rollMin && t.affixes.perfectThreshold <= t.affixes.rollMax)) {
    errs.push('词缀完美阈值必须落在 roll 区间内')
  }
  if (!hasItem('emberstone')) errs.push('缺少重铸石物品: emberstone')
  for (let tier = 1; tier <= maxTier; tier++) {
    const key = String(tier)
    if (!(t.affixes.reforge.goldByTier[key] > 0)) errs.push(`重铸造价缺失: T${tier}`)
    if (!(t.affixes.reforge.essenceByTier[key] >= 0)) errs.push(`重铸精华消耗缺失: T${tier}`)
  }
  if (!(t.affixes.reforge.lockGoldFactor > 0)) errs.push('重铸锁定系数非法')
  if (!(t.affixes.reforge.emberstonePerLock >= 1)) errs.push('重铸锁定重铸石消耗非法')

  // 伙伴与远征（v2.2）
  const compIds = new Set<string>()
  for (const c of t.companions.companions) {
    if (compIds.has(c.id)) errs.push(`伙伴 id 重复: ${c.id}`)
    compIds.add(c.id)
    if (!(c.rarityFactor >= 1)) errs.push(`伙伴战力系数非法: ${c.id}`)
    if (!(c.startLevel >= 1)) errs.push(`伙伴初始等级非法: ${c.id}`)
  }
  if (t.companions.companions.length === 0) errs.push('伙伴名册为空')
  if (!compIds.has(t.expeditions.starter)) errs.push(`初始伙伴不在名册中: ${t.expeditions.starter}`)

  const traitIds = new Set<string>()
  for (const tr of t.expeditions.traits) {
    if (traitIds.has(tr.id)) errs.push(`特质 id 重复: ${tr.id}`)
    traitIds.add(tr.id)
    if (!['supply', 'gold', 'xp', 'find'].includes(tr.effect)) errs.push(`特质效果非法: ${tr.id}`)
    if (tr.value === 0) errs.push(`特质数值不得为 0: ${tr.id}`)
  }
  const hours = t.expeditions.hours
  if (hours.length < 2) errs.push('远征时长档至少 2 档')
  for (let i = 1; i < hours.length; i++) if (hours[i] <= hours[i - 1]) errs.push('远征时长档必须递增')

  const routeIds = new Set<string>()
  const capLevel = t.companions.startLevelCap
  const maxRarity = Math.max(...t.companions.companions.map((c) => c.rarityFactor))
  const teamMax = t.expeditions.team.base + t.expeditions.banner.maxLevel * t.expeditions.team.maxPerBanner
  const bannerMax = Math.pow(1 + t.expeditions.banner.powerPerLevel, t.expeditions.banner.maxLevel)
  const powerCeiling = teamMax * capLevel * maxRarity * (1 + 0.02 * (capLevel - 1)) * bannerMax
  for (const r of t.expeditions.routes) {
    if (routeIds.has(r.id)) errs.push(`路线 id 重复: ${r.id}`)
    routeIds.add(r.id)
    // 评审 B1：需求战力必须可达，否则该路线永远无法满成功率
    if (!(r.reqPower > 0)) errs.push(`路线需求战力非法: ${r.id}`)
    else if (r.reqPower > powerCeiling) {
      errs.push(`路线需求战力超出可达上限: ${r.id} -> ${r.reqPower} > ${Math.floor(powerCeiling)}`)
    }
    // 评审 B2：产出占比上限（防止远征喧宾夺主）
    if (!(r.ratio > 0) || r.ratio > 0.25) errs.push(`路线产出占比非法（需 ∈ (0, 0.25]）: ${r.id}`)
    if (!(r.anchorGoldPerHour > 0)) errs.push(`路线锚点非法: ${r.id}`)
    if (!hasItem(r.supply.itemId)) errs.push(`路线补给物品不存在: ${r.id} -> ${r.supply.itemId}`)
    if (!(r.supply.qtyPer8h > 0)) errs.push(`路线补给数量非法: ${r.id}`)
    if (!hasItem(r.materialItemId)) errs.push(`路线材料物品不存在: ${r.id} -> ${r.materialItemId}`)
    if (r.relic !== null && !hasItem(r.relic)) errs.push(`路线遗物不存在: ${r.id} -> ${r.relic}`)
    if (!(r.relicChancePerHour >= 0)) errs.push(`路线遗物概率非法: ${r.id}`)
    if (r.unlock.type === 'skill' && (!r.unlock.skill || !SKILL_IDS.includes(r.unlock.skill))) {
      errs.push(`路线解锁技能非法: ${r.id}`)
    }
    if (r.unlock.type === 'companion' && !(r.unlock.value >= 1)) errs.push(`路线解锁伙伴数非法: ${r.id}`)
    // 评审 M3：重铸石远征供给不得超过采矿主来源的量级（≤1.15/时）
    if (r.stonePer8h / 8 > 1.15) errs.push(`路线重铸石产出超上限（≤1.15/时）: ${r.id}`)
  }
  for (const itemId of ['expedition_token', 'relic_gear', 'relic_shard', 'relic_core']) {
    if (!hasItem(itemId)) errs.push(`缺少 v2.2 物品: ${itemId}`)
  }
  if (!(t.expeditions.goldShare >= 0 && t.expeditions.goldShare <= 1)) errs.push('远征金币占比非法')
  if (!(t.expeditions.failYieldShare >= 0 && t.expeditions.failYieldShare <= 1)) errs.push('远征保底占比非法')
  if (t.expeditions.banner.cost.length !== t.expeditions.banner.maxLevel) errs.push('旗帜升级曲线长度与上限不符')
  if (!(t.expeditions.levelCurve.base > 0 && t.expeditions.levelCurve.exponent > 1)) errs.push('伙伴经验曲线非法')

  // 图鉴与赛季（v2.3）
  const s = t.season
  if (!(s.days >= 1)) errs.push('赛季天数非法')
  if (!(s.levels >= 1) || !(s.renownPerLevel >= 1)) errs.push('赛季等级/声望配置非法')
  if (!(s.epoch > 0)) errs.push('赛季纪元非法')
  if (!(s.unlockTotalLevel >= 0)) errs.push('赛季解锁门槛非法')
  for (const tier of ['bronze', 'silver', 'gold'] as const) {
    if (!(s.tierRenown[tier] > 0)) errs.push(`赛季档位声望非法: ${tier}`)
  }
  if (s.templates.length < 4) errs.push('赛季模板至少 4 条（保证 3 条抽取有余量）')
  const tplIds = new Set<string>()
  for (const tpl of s.templates) {
    if (tplIds.has(tpl.id)) errs.push(`赛季模板 id 重复: ${tpl.id}`)
    tplIds.add(tpl.id)
    if (!TASK_COUNTERS.includes(tpl.counter)) errs.push(`赛季模板计数器非法: ${tpl.id} -> ${tpl.counter}`)
    if (tpl.targets.length !== 3) errs.push(`赛季模板目标档数非法: ${tpl.id}`)
    for (let i = 1; i < tpl.targets.length; i++) {
      if (tpl.targets[i] <= tpl.targets[i - 1]) errs.push(`赛季目标必须递增: ${tpl.id}`)
    }
  }
  // v3.3 B1：目标缩放的合法性（系数范围与下限、缩放后仍严格递增且不低于 base×下限、分档边界）
  const scale = s.scaleByMaturity
  if (!scale) errs.push('缺少赛季缩放系数 scaleByMaturity')
  else {
    for (const k of ['junior', 'veteran'] as const) {
      const v = scale[k]
      if (!(v > 0) || v > 1) errs.push(`赛季缩放系数非法: ${k} = ${v}`)
      else if (v < s.coefFloor) errs.push(`赛季缩放系数低于下限: ${k} = ${v} < ${s.coefFloor}`)
    }
  }
  if (!(s.coefFloor > 0 && s.coefFloor <= 1)) errs.push(`赛季缩放下限非法: ${s.coefFloor}`)
  if (!(s.maturityBands.juniorMaxTotalLevel >= s.unlockTotalLevel)) {
    errs.push('分档边界应不小于赛季解锁门槛（否则存在"能参赛却按未参赛档缩放"的空洞）')
  }
  if (scale && s.coefFloor > 0) {
    for (const tpl of s.templates) {
      const scaled = tpl.targets.map((t) => Math.max(1, Math.ceil(t * scale.junior)))
      if (!(scaled[0] < scaled[1] && scaled[1] < scaled[2])) errs.push(`缩放后目标不再递增: ${tpl.id}`)
      if (scaled.some((v, i) => v < tpl.targets[i] * s.coefFloor)) errs.push(`缩放后目标低于下限保护: ${tpl.id}`)
    }
  }
  const ms = s.codexMilestones
  if (ms.length === 0) errs.push('图鉴里程碑为空')
  for (let i = 0; i < ms.length; i++) {
    if (!(ms[i].pct > 0) || ms[i].pct > 1) errs.push(`图鉴里程碑比例非法: #${i}`)
    if (i > 0 && ms[i].pct <= ms[i - 1].pct) errs.push('图鉴里程碑比例必须递增')
    if (!(ms[i].gold >= 0 && ms[i].essence >= 0 && ms[i].tokens >= 0)) errs.push(`图鉴里程碑奖励非法: #${i}`)
    // v3.0 评审 M2：分区门槛必须六区齐全且键名合法（否则该分区被静默跳过）
    const REQ_KEYS = ['items', 'recipes', 'affixes', 'companions', 'relics', 'ores']
    const req = ms[i].req as Record<string, number> | undefined
    if (!req) errs.push(`图鉴里程碑缺少分区门槛: #${i}`)
    else {
      for (const k of REQ_KEYS) {
        if (typeof req[k] !== 'number') errs.push(`图鉴里程碑分区门槛缺失: #${i} -> ${k}`)
        else if (!(req[k] > 0 && req[k] <= 1)) errs.push(`图鉴里程碑分区门槛越界: #${i}.${k}`)
      }
      for (const k of Object.keys(req)) if (!REQ_KEYS.includes(k)) errs.push(`图鉴里程碑分区键非法: #${i} -> ${k}`)
    }
    if (typeof ms[i].title !== 'string' || ms[i].title.length === 0) errs.push(`图鉴里程碑缺少称号: #${i}`)
  }
  if (!(s.levelReward.goldBase >= 0 && s.levelReward.tokenEvery >= 1)) errs.push('赛季等级奖励配置非法')

  // 深渊回廊（v2.4）
  const ab = t.abyss
  if (!(ab.staminaMax >= 1)) errs.push('深渊体力上限非法')
  if (!(ab.staminaRegenMinutes > 0)) errs.push('深渊体力恢复间隔非法')
  if (!(ab.base > 0)) errs.push('深渊门槛基数非法')
  if (!(ab.growth > 1)) errs.push('深渊门槛增长率必须 > 1')
  if (ab.themes.length === 0) errs.push('深渊主题为空')
  for (const k of ['speed', 'efficiency', 'quantity', 'rareFind', 'wisdom', 'enhanceRate'] as const) {
    if (!(ab.weights[k] > 0)) errs.push(`深渊权重非法: ${k}`)
  }
  const shopIds = new Set<string>()
  for (const it of ab.shop) {
    if (shopIds.has(it.id)) errs.push(`深渊商品 id 重复: ${it.id}`)
    shopIds.add(it.id)
    if (!(it.crystal > 0)) errs.push(`深渊商品价格非法: ${it.id}`)
    if (!(it.max >= 1)) errs.push(`深渊商品上限非法: ${it.id}`)
    if (!(it.priceGrowth >= 1)) errs.push(`深渊商品涨价系数非法: ${it.id}`)
    if (it.itemId && !hasItem(it.itemId)) errs.push(`深渊商品发放的物品不存在: ${it.id} -> ${it.itemId}`)
  }
  if (!shopIds.has('reroll_ticket')) errs.push('深渊商店缺少定向重铸券')
  if (!shopIds.has('permanent_speed')) errs.push('深渊商店缺少永久速度')

  // 视听与手感（v2.5）
  // v3.0：深渊层词条与离线参数（评审 M2：所有新参数都必须进表并被校验）——并入既有深渊校验段
  const mods = ab.mods ?? []
  if (mods.length !== 5) errs.push('深渊层词条必须恰好 5 种（覆盖 %5 的 0~4）')
  if (new Set(mods.map((m) => m.mod)).size !== mods.length) errs.push('深渊层词条 mod 重复')
  for (const m of mods) {
    if (!(m.mod >= 0 && m.mod <= 4)) errs.push(`层词条 mod 越界: ${m.id}`)
    if (!(m.reqMul > 0.8 && m.reqMul < 1.25)) errs.push(`层词条门槛倍率越界: ${m.id} -> ${m.reqMul}`)
    if (!(m.crystalMul > 0 && m.crystalMul <= 2)) errs.push(`层词条结晶倍率越界: ${m.id} -> ${m.crystalMul}`)
    for (const [k, v] of Object.entries(m.weightMul ?? {})) {
      if (!(v > 0 && v <= 2)) errs.push(`层词条权重修正越界: ${m.id}.${k} -> ${v}`)
    }
  }
  if (ab.rounding !== 'floor' && ab.rounding !== 'round') errs.push('结晶取整方式非法')
  // v3.1：入门三层与连打代价
  const intro = ab.introReqs ?? []
  if (intro.length !== 3) errs.push('入门层门槛必须恰好 3 层')
  for (let i = 0; i < intro.length; i++) {
    if (!(intro[i] > 0 && intro[i] < 6)) errs.push(`入门层门槛越界: #${i} -> ${intro[i]}`)
    if (i > 0 && intro[i] <= intro[i - 1]) errs.push('入门层门槛必须递增')
  }
  const chain = ab.chainCost ?? []
  if (chain.length < ab.challengeMaxFloors) errs.push('连打体力代价必须覆盖全部连打层数')
  for (let i = 0; i < chain.length; i++) {
    if (!(chain[i] >= 1 && chain[i] <= 4)) errs.push(`连打体力代价越界: 第 ${i + 1} 层 -> ${chain[i]}`)
    if (i > 0 && chain[i] < chain[i - 1]) errs.push('连打体力代价必须非递减')
  }
  // 入门三层必须与第 4 层门槛衔接（不能高于它，否则"入门层"反而更难）
  const req4 = ab.base * Math.pow(ab.growth, 3) * (ab.mods.find((m) => m.mod === 4)?.reqMul ?? 1)
  if (intro.length === 3 && intro[2] >= req4) errs.push('入门层末档门槛不应高于第 4 层')
  if (!(ab.challengeMaxFloors >= 1 && ab.challengeMaxFloors <= 5)) errs.push('连打上限越界')
  if (!(ab.sweepMaxCount >= 1 && ab.sweepMaxCount <= 50)) errs.push('批量扫荡上限越界')
  if (!(ab.offlineCapExtra >= 0 && ab.offlineCapExtra <= ab.staminaMax)) errs.push('离线回体上限提升越界')

  const fxd = t.fx
  const cueIds = new Set<string>()
  for (const cue of fxd.cues) {
    if (cueIds.has(cue.id)) errs.push(`音效 id 重复: ${cue.id}`)
    cueIds.add(cue.id)
    if (!(cue.durationMs > 0)) errs.push(`音效时长非法: ${cue.id}`)
    if (!(cue.gain > 0 && cue.gain <= 1)) errs.push(`音效音量非法: ${cue.id}`)
    if (!Array.isArray(cue.freqs) || cue.freqs.length === 0) errs.push(`音效缺少音高: ${cue.id}`)
    for (const fr of cue.freqs) if (!(fr > 20 && fr < 20000)) errs.push(`音效音高越界: ${cue.id} -> ${fr}`)
    if (!['sine', 'square', 'triangle', 'sawtooth', 'noise'].includes(cue.wave)) errs.push(`音效波形非法: ${cue.id}`)
  }
  if (fxd.cues.length < 16) errs.push('音效数量不足 16 条')
  // 测评 Minor-4：原先只查 4 个键，漏了 maxBurstsPerSecond（频率上限缺失时不会报错）
  for (const k of [
    'maxParticles',
    'maxBurstParticles',
    'maxBurstsPerSecond',
    'maxPopups',
    'maxConcurrentVoices',
  ] as const) {
    if (!(fxd.budget[k] >= 1)) errs.push(`表现预算非法: ${k}`)
  }
  if (!(fxd.budget.maxPopups <= fxd.budget.maxParticles)) errs.push('飘字上限不应超过粒子上限')
  if (!Array.isArray(fxd.fxLevels) || fxd.fxLevels.length !== 3) errs.push('动效档位应为 3 档（full/reduced/off）')
  if (!(fxd.fxLevels.includes('full') && fxd.fxLevels.includes('reduced') && fxd.fxLevels.includes('off'))) {
    errs.push('动效档位缺少 full/reduced/off')
  }
  if (!(fxd.budget.frameBudgetMs > 0 && fxd.budget.loopBudgetMs > 0)) errs.push('表现层时间预算非法')
  if (fxd.defaults.fx !== 'auto' && !fxd.fxLevels.includes(fxd.defaults.fx)) errs.push('默认动效档不在档位列表内')
  if (!(fxd.defaults.volume >= 0 && fxd.defaults.volume <= 100)) errs.push('默认音量非法')

  // v3.1：金币商店反套利（买价 > 回收价，否则玩家可"买了卖"套利）
  for (const gs of t.goldShop) {
    if (!(gs.basePrice > 0)) errs.push(`金币商店价格非法: ${gs.id}`)
    if (!(gs.growth >= 1)) errs.push(`金币商店增长率必须 ≥ 1: ${gs.id}`)
    if (!t.items[gs.itemId]) errs.push(`金币商店物品不存在: ${gs.id} -> ${gs.itemId}`)
    else if (gs.basePrice <= (t.items[gs.itemId].value ?? 0)) {
      errs.push(`金币商店存在套利风险（买价 ≤ 回收价）: ${gs.id}`)
    }
  }

  // 曲线与配置
  if (t.levelCurve.baseXp <= 0) errs.push('levelCurve.baseXp 非法')
  for (let i = 1; i < t.levelCurve.bands.length; i++) {
    if (t.levelCurve.bands[i].fromLevel <= t.levelCurve.bands[i - 1].fromLevel) errs.push('levelCurve 分段必须递增')
  }
  if (t.config.minActionTimeMs <= 0 || t.config.offlineCapHours <= 0) errs.push('config 数值非法')
  if (!(t.config.prestigeUnlockLevel > 0)) errs.push('config.prestigeUnlockLevel 非法')
  // v3.3 C4：回收确认阈值必须在 (0,1] / >0 范围内（否则确认永不触发或恒触发）
  if (!(t.config.recycleConfirm.perfectScore > 0 && t.config.recycleConfirm.perfectScore <= 1)) errs.push('config.recycleConfirm.perfectScore 非法')
  if (!(t.config.recycleConfirm.goldGain > 0)) errs.push('config.recycleConfirm.goldGain 非法')
  if (!(t.config.recycleConfirm.enhanceLevel >= 0)) errs.push('config.recycleConfirm.enhanceLevel 非法')

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
  perks: perksJson,
  affixes: affixesJson,
  companions: companionsJson,
  expeditions: expeditionsJson,
  season: seasonJson,
  abyss: abyssJson,
  goldShop: goldShopJson,
  fx: fxJson,
  config: configJson,
} as unknown as ContentTables

{
  const errs = validateContent(CONTENT)
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
export const PERK_BY_ID = new Map(CONTENT.perks.map((p) => [p.id, p] as const))
export const AFFIX_BY_ID: ReadonlyMap<string, AffixDef> = new Map(CONTENT.affixes.affixes.map((a) => [a.id, a] as const))
export const COMPANION_BY_ID: ReadonlyMap<string, CompanionDef> = new Map(
  CONTENT.companions.companions.map((c) => [c.id, c] as const),
)
export const ROUTE_BY_ID: ReadonlyMap<string, ExpeditionRouteDef> = new Map(
  CONTENT.expeditions.routes.map((r) => [r.id, r] as const),
)
export const TRAIT_BY_ID: ReadonlyMap<string, TraitDef> = new Map(CONTENT.expeditions.traits.map((t) => [t.id, t] as const))
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

/** 同级锭 itemId（用于强化消耗解析；v2.1 补齐 T6/T7，与 items.json 档位一致） */
export function ingotIdForTier(tier: Tier): ItemId {
  const suffix = { 1: 'copper', 2: 'iron', 3: 'silver', 4: 'gold', 5: 'mithril', 6: 'starlite', 7: 'void' }[tier]
  return `ingot_${suffix}`
}
