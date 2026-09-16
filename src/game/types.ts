// ============================================================
// Forging · 内核类型契约（v1.5）
// 规则：
//   - 本文件是【内核线（src/game）】与【壳线（src/app、src/ui）】唯一接口
//   - 内核纯函数：无 DOM、无 Vue、可单测、可序列化
// ============================================================

// ---------- 基础枚举 ----------

export type SkillId = 'mining' | 'smelting' | 'forging' | 'enhancing'

export type Tier = 1 | 2 | 3 | 4 | 5 | 6 | 7

export type ItemId = string

export type ItemCategory =
  | 'ore'
  | 'ingot'
  | 'coal'
  | 'essence'
  | 'crate'
  | 'tool'
  | 'weapon'
  | 'armor'
  | 'jewelry'
  | 'rune'
  /** v2.1：助剂类材料（重铸石 / 远征徽记） */
  | 'reagent'
  /** v2.2：遗物（value 0，仅作收藏与系统内消耗） */
  | 'relic'

/** 装备槽位（v1.3 起 10 槽：含项链/戒指） */
export type SlotId =
  | 'pick'
  | 'crucible'
  | 'hammer'
  | 'mainHand'
  | 'head'
  | 'body'
  | 'legs'
  | 'feet'
  | 'necklace'
  | 'ring'

// ---------- 内容表（data/*.json 类型） ----------

export interface ItemStats {
  /** 对应技能速度加成（0.15 = +15%） */
  speed: number
  /** 效率（0.02 = +2%） */
  efficiency: number
  /** 产量 */
  quantity: number
  /** XP 加成 */
  wisdom: number
  /** 稀有掉落 */
  rareFind: number
  /** 强化成功率（v1.3 饰品专属；0.01 = +1%） */
  successRate: number
}

export interface ItemDef {
  id: ItemId
  name: string
  /** 材料类（煤/精华/小箱）无档位 */
  tier?: Tier
  category: ItemCategory
  /** tool / weapon / armor / jewelry 才有 */
  slot?: SlotId
  /** 缺省项视为 0 */
  stats?: Partial<ItemStats>
  enhanceable: boolean
  /** 回收价（金） */
  value: number
  stackable: boolean
}

export interface RareDrop {
  itemId: ItemId
  rate: number
}

/** 矿场动作（含煤矿场） */
export interface OreSiteDef {
  id: string
  name: string
  skill: SkillId
  tier: Tier
  unlockLevel: number
  baseTimeMs: number
  xp: number
  outputItemId: ItemId
  /** 均匀随机 [min, max]，期望 = 均值 */
  yieldMin: number
  yieldMax: number
  rareDrops: RareDrop[]
}

/** 配方（熔炼 / 锻造 / 符文） */
export interface RecipeDef {
  id: string
  name: string
  skill: SkillId
  category: string
  tier: Tier
  unlockLevel: number
  baseTimeMs: number
  xp: number
  inputs: { itemId: ItemId; qty: number }[]
  outputs: { itemId: ItemId; qty: number }[]
  rareDrops: RareDrop[]
}

/** 强化档位（目标等级 t：尝试 +t） */
export interface EnhanceStepDef {
  targetLevel: number
  successRate: number
  /** true = 失败降「当前级 −1」；false = 失败等级不变 */
  downgrade: boolean
  /** 消耗：同级锭与精华数量（锭的具体档位由被强化物品解析） */
  cost: { ingots: number; essences: number }
  baseTimeMs: number
  xpBase: number
}

export interface LevelBand {
  fromLevel: number
  multiplier: number
}

export interface LevelCurveDef {
  baseXp: number
  /** 分段乘区（k 属于 [fromLevel, nextFrom-1]） */
  bands: LevelBand[]
}

export interface TutorialStepDef {
  step: number
  title: string
  goal: {
    type: 'mineItem' | 'craftItem' | 'equipSlot' | 'enhanceInstance' | 'totalLevel'
    target: number
    itemId?: ItemId
    slotId?: SlotId
  }
  rewards: {
    itemId?: ItemId
    qty?: number
    gold?: number
    queueSlot?: number
  }[]
}

export interface ConfigDef {
  offlineCapHours: number
  minActionTimeMs: number
  /** 队列扩容价格（第 2、3 个队列位） */
  queueSlotCosts: number[]
  autosaveSec: number
  coalMineUnlock: number
  defaultQueueSlots: number
  maxQueueSlots: number
  /** v1.5：传承解锁总等级 */
  prestigeUnlockLevel: number
  /** v3.3 C4：高价值回收的二次确认阈值（完美度比例 / 单件金币） */
  recycleConfirm: { perfectScore: number; goldGain: number }
}

export interface SkillDef {
  id: SkillId
  name: string
  maxLevel: number
}

// ---------- 成就 ----------

export type AchievementType =
  | 'stat'
  | 'skillLevel'
  | 'enhanceLevel'
  | 'totalLevel'
  | 'totalValue'
  | 'itemCount'
  | 'slotsFilled'
  | 'buffSlots'
  /** v2.1：已装备槽中带词缀的件数 */
  | 'affixSlots'
  /** v2.1：单件装备的词缀条数（任一件达到即算） */
  | 'affixCount'
  /** v2.2：伙伴与远征 */
  /** v2.3：图鉴收集度（百分比）与赛季等级 */
  | 'codexPercent'
  | 'seasonLevel'
  /** 单赛季声望总量（如三线全金 = 120） */
  | 'seasonRenown'
  /** v2.4：深渊最高层与累计结晶 */
  | 'abyssFloor'
  | 'abyssCrystals'
  | 'companionCount'
  | 'companionRarity'
  | 'relicCount'
  | 'bannerLevel'

export interface AchievementReward {
  gold?: number
  itemId?: ItemId
  qty?: number
}

export interface AchievementDef {
  id: string
  name: string
  desc: string
  type: AchievementType
  /** type=stat：计数器名 */
  stat?: string
  /** type=skillLevel：目标技能 */
  skill?: SkillId
  /** type=itemCount：目标物品 */
  itemId?: ItemId
  /** type=companionRarity：目标稀有度 */
  rarity?: CompanionRarity
  target: number
  rewards: AchievementReward[]
}

export interface AchievementFlags {
  /** 已解锁成就 id（解锁即自动发奖） */
  unlocked: string[]
}

// ---------- 任务 ----------

export type TaskCounter =
  | 'totalMines'
  | 'totalSmelts'
  | 'totalForges'
  | 'totalCrafts'
  | 'totalEnhances'
  | 'totalGoldEarned'
  | 'totalCratesOpened'
  | 'totalJewelryForged'
  | 'totalRunesCrafted'
  | 'totalReforges'
  /** v3.1：仅统计 T4+ 装备（防止在低档装备上刷计数） */
  | 'totalEnhancesT4'
  | 'totalReforgesT4'
  | 'totalExpeditions'

export interface TaskTemplate {
  id: string
  title: string
  desc: string
  counter: TaskCounter
  unit: string
  /** 三档难度（易/中/难） */
  targets: [number, number, number]
  gold: [number, number, number]
  essence: [number, number, number]
  crates: [number, number, number]
}

export interface WeeklyTaskTemplate {
  id: string
  title: string
  desc: string
  counter: TaskCounter
  unit: string
  target: number
  gold: number
  essence: number
  crates: number
}

export interface TasksDef {
  daily: TaskTemplate[]
  weekly: WeeklyTaskTemplate[]
}

/** 任务槽运行时状态（进度 = 计数器当前值 − base） */
export interface TaskSlot {
  defId: string
  target: number
  gold: number
  essence: number
  crates: number
  base: number
  done: boolean
}

export interface TaskState {
  /** 本地日期 YYYY-MM-DD */
  dailyDate: string
  daily: TaskSlot[]
  rerollsLeft: number
  paidRerollsLeft: number
  /** ISO 周键 YYYY-Www */
  weekKey: string
  weekly: TaskSlot | null
}

// ---------- 符文增益 ----------

export type RuneEffect = 'speed' | 'efficiency' | 'rareFind' | 'enhanceRate'

export interface RuneDef {
  id: ItemId
  name: string
  effect: RuneEffect
  value: number
  durationMs: number
}

/** 增益槽（until 为真实时间戳） */
export interface BuffSlot {
  defId: ItemId
  until: number
}

// ---------- 词缀（v2.1） ----------

/** 词缀效果：前 6 项与 ItemStats 同源（走同一加法池）；guard / goldFind 为词缀专有 */
export type AffixEffect =
  | 'speed'
  | 'quantity'
  | 'efficiency'
  | 'wisdom'
  | 'rareFind'
  | 'enhanceRate'
  /** 强化失败不降级概率 */
  | 'guard'
  /** 回收收益加成 */
  | 'goldFind'
  /** 重铸石掉落加成 */
  | 'stoneFind'

export interface AffixDef {
  /** v3.0 L1：最低适用档位（缺省 = 全档可用）；用于按档位过滤词缀池 */
  tierMin?: number
  id: string
  name: string
  effect: AffixEffect
  /** 机内效果说明（弹窗展示，玩家必须能读懂——v2.1 评审 B1） */
  desc: string
  /** 一档（T1）完美值 */
  base: number
  /** 每档递增（完美值 = base + perTier × (tier − 1)） */
  perTier: number
}

/** 装备实例上的一条词缀（value 为最终数值） */
export interface AffixRoll {
  /** 词缀定义 id */
  id: string
  value: number
}

/** 装备原型（= 物品 category）：决定词缀池 */
export type AffixArchetype = 'tool' | 'weapon' | 'armor' | 'jewelry'

export interface AffixesDef {
  affixes: AffixDef[]
  /** 原型 → 可选词缀 id（互不重复抽取） */
  pools: Record<AffixArchetype, string[]>
  /** 档位 → 词缀条数 */
  countByTier: Record<string, number>
  /** 单条词缀品质下界（value = max × roll，roll ∈ [rollMin, rollMax]） */
  rollMin: number
  rollMax: number
  /** 视为「完美」的品质阈值 */
  perfectThreshold: number
  reforge: {
    goldByTier: Record<string, number>
    /** 每锁定 1 条，金币造价 ×(1 + lockGoldFactor × 锁定数) */
    lockGoldFactor: number
    essenceByTier: Record<string, number>
    /** 每锁定 1 条消耗的重铸石数量 */
    emberstonePerLock: number
  }
}

// ---------- 深渊回廊（v2.4） ----------

export type AbyssWeightKey = 'speed' | 'efficiency' | 'quantity' | 'rareFind' | 'wisdom' | 'enhanceRate'

export interface AbyssShopItemDef {
  id: string
  name: string
  desc: string
  crystal: number
  max: number
  /** 每次购买后的价格倍数（一次性项 = 1） */
  priceGrowth: number
  /** permanent_speed 用：每级加成 */
  perLevel?: number
  /** 遗物兑换用：发放的物品 */
  itemId?: ItemId
}

/** v3.0 层词条：按 floor % 5 取值（mod 为取模余数） */
export interface AbyssModDef {
  mod: number
  id: string
  name: string
  desc: string
  /** 该层门槛倍率 */
  reqMul: number
  /** 该层结晶倍率（首通与扫荡都乘，取整见 AbyssDef.rounding） */
  crystalMul: number
  /** 该层的有效权重修正（缺省项按 1） */
  weightMul: Partial<Record<AbyssWeightKey, number>>
}

export interface AbyssDef {
  staminaMax: number
  staminaRegenMinutes: number
  weights: Record<AbyssWeightKey, number>
  base: number
  growth: number
  themes: string[]
  /** v3.0：层词条表（五种，覆盖 %5 的 0~4） */
  mods: AbyssModDef[]
  /** v3.0：结晶取整方式（脚本与内核同源） */
  rounding: 'floor'
  /** v3.0：一次挑战最多连打层数 */
  challengeMaxFloors: number
  /** v3.1：连打体力代价（下标 = 层数−1；长度须覆盖 challengeMaxFloors） */
  chainCost: number[]
  /** v3.1：入门三层门槛（第 1~3 层，第 4 层起接 base 曲线）；修"看得见打不了" */
  introReqs: number[]
  /** v3.0：批量扫荡单次上限 */
  sweepMaxCount: number
  /** v3.0：离线结算时体力上限的提升量（仅离线段生效） */
  offlineCapExtra: number
  firstClearCrystal: { base: number; perFloor: number }
  repeatCrystal: { base: number; perFloor: number }
  shop: AbyssShopItemDef[]
}

export interface AbyssState {
  /** 已通关的最高层（0 = 未通关） */
  bestFloor: number
  crystals: number
  stamina: number
  /** 上次结算体力的时间戳（真实时间；单调守卫用） */
  staminaAt: number
  /** 商店购买次数（itemId → 次数） */
  purchased: Record<string, number>
  /** 定向重铸券余量 */
  tickets: number
  /** 永久速度等级 */
  permanentSpeed: number
  /** 称号是否已购买 */
  title: boolean
}

/** v3.1：金币商店（可无限购买、价格递增的循环出口） */
export interface GoldShopItemDef {
  id: string
  itemId: string
  name: string
  desc: string
  basePrice: number
  growth: number
}

// ---------- 视听与手感（v2.5） ----------

/** 实际生效的动效档位 */
export type FxLevel = 'full' | 'reduced' | 'off'
/** 玩家可选档位：auto 表示跟随系统「减少动态效果」偏好（壳层解析为 FxLevel） */
export type FxSetting = 'auto' | FxLevel

export interface FxCueDef {
  id: string
  name: string
  wave: 'sine' | 'square' | 'triangle' | 'sawtooth' | 'noise'
  freqs: number[]
  durationMs: number
  gain: number
}

export interface FxBudgetDef {
  maxParticles: number
  maxBurstParticles: number
  maxBurstsPerSecond: number
  maxPopups: number
  frameBudgetMs: number
  loopBudgetMs: number
  maxConcurrentVoices: number
}

export interface FxDef {
  cues: FxCueDef[]
  budget: FxBudgetDef
  defaults: { sound: boolean; volume: number; fx: FxSetting }
  fxLevels: FxLevel[]
}

/** 玩家表现层设置（v2.5） */
export interface SettingsState {
  sound: boolean
  /** 0~100 */
  volume: number
  fx: FxSetting
}

// ---------- 图鉴与赛季（v2.3） ----------

/**
 * 图鉴登记（v3.0 位图）。
 * bits = base64 位图（216 bit = 27B，覆盖 物品/配方/词缀/矿场 四个分区；遗物也是 item id，同池登记）；
 * fp = 内容表指纹（id 顺序 + 规模）—— 不符时按已收集 id 重建位序（内容表增删条目不丢进度）。
 */
export interface CodexState {
  bits: string
  fp: string
}

export type SeasonTier = 'bronze' | 'silver' | 'gold'

export interface SeasonTemplateDef {
  id: string
  title: string
  desc: string
  counter: TaskCounter
  unit: string
  /** 三档目标（铜/银/金） */
  targets: [number, number, number]
}

/** 赛季任务槽（独立结构：不复用 TaskSlot——tasks.ts 的 defOf 只认 daily/weekly） */
export interface SeasonSlot {
  defId: string
  /** 计数基线快照（赛季开始时的计数器值） */
  base: number
}

export interface SeasonState {
  /** 赛季序号（floor((now − epoch)/14d)）；仅前向轮换 */
  index: number
  renown: number
  /** 已发奖到的等级（单调不回退，保证幂等） */
  rewardedLevel: number
  tasks: SeasonSlot[]
}

export interface CodexMilestoneDef {
  /** v3.0：图鉴称号（四档各一个，显示在顶栏） */
  title: string
  /** v3.0：分区门槛（物品/配方/词缀/伙伴/遗物/矿场 各自的相对进度，0~1） */
  req: Record<'items' | 'recipes' | 'affixes' | 'companions' | 'relics' | 'ores', number>
  pct: number
  gold: number
  essence: number
  tokens: number
}

export interface SeasonDef {
  /** 赛季纪元（UTC ms） */
  epoch: number
  days: number
  unlockTotalLevel: number
  levels: number
  renownPerLevel: number
  tierRenown: Record<SeasonTier, number>
  levelReward: {
    goldBase: number
    goldPerLevel: number
    essenceBase: number
    essencePerFour: number
    tokenEvery: number
    tokenAmount: number
    maxLevelTokens: number
  }
  templates: SeasonTemplateDef[]
  codexMilestones: CodexMilestoneDef[]
  /** v3.3 B1：赛季目标按账号分档缩放（系数由 scripts/sim-season.mjs 反推，测试断言与脚本输出一致） */
  scaleByMaturity: { junior: number; veteran: number }
  /** v3.3 B1：系数下限（防奖杯化；脚本 guards.floorOk 用同一值） */
  coefFloor: number
  /** v3.3 B1：分档边界（总等级 ≤此值为新晋，其余为老手） */
  maturityBands: { juniorMaxTotalLevel: number }
}

// ---------- 伙伴与远征（v2.2） ----------

export type CompanionRarity = 'common' | 'elite' | 'legend'

export interface CompanionDef {
  id: string
  name: string
  rarity: CompanionRarity
  /** 战力系数（1.0 / 1.25 / 1.6） */
  rarityFactor: number
  startLevel: number
  desc: string
}

export type TraitEffect = 'supply' | 'gold' | 'xp' | 'find'

export interface TraitDef {
  id: string
  name: string
  desc: string
  effect: TraitEffect
  value: number
}

export interface CompanionState {
  level: number
  xp: number
  /** 特质 id */
  trait: string
}

export type RouteUnlock =
  | { type: 'companion'; value: number }
  | { type: 'skill'; skill: SkillId; value: number }
  | { type: 'totalLevel'; value: number }

export interface ExpeditionRouteDef {
  id: string
  name: string
  unlock: RouteUnlock
  /** 需求战力（战力不足不阻塞，只降低成功率） */
  reqPower: number
  /** 产出锚点：解锁档的采矿金/时（分母口径，不随配装漂移） */
  anchorGoldPerHour: number
  /** 毛产出 = 锚点 × ratio */
  ratio: number
  tier: Tier
  supply: { itemId: ItemId; qtyPer8h: number }
  tokenPer8h: number
  relic: ItemId | null
  relicChancePerHour: number
  stonePer8h: number
  xpPerHour: number
  /** 材料本位矿石 */
  materialItemId: ItemId
}

export interface ExpeditionsDef {
  routes: ExpeditionRouteDef[]
  traits: TraitDef[]
  hours: number[]
  goldShare: number
  team: { base: number; maxPerBanner: number }
  banner: { maxLevel: number; powerPerLevel: number; cost: { tokens: number; gold: number }[] }
  recruit: { tokens: number; gold: number; duplicateXp: number }
  traitReroll: { tokens: number; gold: number }
  levelCurve: { base: number; exponent: number }
  failYieldShare: number
  starter: string
}

export interface CompanionsDef {
  companions: CompanionDef[]
  startLevelCap: number
}

/** 一次远征的结算产物（离线为期望值，可能含小数 → 领取时按小数结转取整） */
export interface ExpeditionOutcome {
  gold: number
  materials: { itemId: ItemId; qty: number }[]
  tokens: number
  relics: { itemId: ItemId; qty: number }[]
  xp: number
  /** 成功率判定（在线为真随机；离线为期望，恒等于成功率本身不适用 → 见 planned） */
  success: boolean
  /** 期望模式标记（离线结算产物需走小数结转） */
  expected: boolean
}

export interface ExpeditionRun {
  id: number
  routeId: string
  hours: number
  startedAt: number
  endsAt: number
  team: string[]
  /** 完成并已结算（待领取） */
  done: boolean
  outcome: ExpeditionOutcome | null
}

export interface ExpeditionState {
  runs: ExpeditionRun[]
  banner: number
  nextRunId: number
}

// ---------- 精通（v1.5 转生系统） ----------

export type PerkEffect = 'speed' | 'wisdom' | 'efficiency' | 'rareFind' | 'offlineHours' | 'startLevel'

export interface PerkDef {
  id: string
  name: string
  desc: string
  effect: PerkEffect
  /** 每点效果增量 */
  perPoint: number
  max: number
  /** 每点消耗精通点 */
  cost: number
}

export interface PrestigeState {
  /** 可用精通点（购买扣减、退款返还） */
  points: number
  /** perkId → 已投点数 */
  perks: Record<string, number>
}

// ---------- 自动化（v1.7） ----------

/** 动作预设（保存当前动作 + 队列，一键重放） */
export interface LoadoutAction {
  ref: ActionRef
  count: number | null
}

export interface LoadoutDef {
  id: string
  name: string
  actions: LoadoutAction[]
}

/**
 * v3.1 装备预设（测评 A/B 共同点名：深渊层词条要求"为某层重配装"，
 * 但换装一次要约 20 次点击 → 摩擦 >> 收益）。
 * 只存槽位 → instanceId 的映射；应用时逐槽穿戴（装备已被回收/不存在的槽位跳过并如实提示）。
 */
export interface GearSetDef {
  id: string
  name: string
  /** 槽位 → 实例 id（缺省 = 该槽留空） */
  slots: Partial<Record<SlotId, number>>
}

/** 自动回收：itemId → 保留数量（卖出超出部分） */
export type AutoRecycleMap = Record<string, number>

export interface ContentTables {
  skills: SkillDef[]
  ores: OreSiteDef[]
  items: Record<ItemId, ItemDef>
  recipes: RecipeDef[]
  levelCurve: LevelCurveDef
  enhance: EnhanceStepDef[]
  tutorial: TutorialStepDef[]
  achievements: AchievementDef[]
  tasks: TasksDef
  runes: RuneDef[]
  perks: PerkDef[]
  affixes: AffixesDef
  companions: CompanionsDef
  expeditions: ExpeditionsDef
  season: SeasonDef
  abyss: AbyssDef
  goldShop: GoldShopItemDef[]
  fx: FxDef
  config: ConfigDef
}

// ---------- 运行时状态（存档 schema） ----------

/** 装备实例（独立于堆叠材料；每件有唯一 instanceId） */
export interface EquipInstance {
  instanceId: number
  itemId: ItemId
  enhanceLevel: number
  /** v2.1：词缀（条数由档位决定；旧档由迁移确定性回填） */
  affixes: AffixRoll[]
}

export type ActionRef =
  | { kind: 'mine'; siteId: string }
  | { kind: 'craft'; recipeId: string }
  | { kind: 'enhance'; instanceId: number; targetLevel: number }

export interface ActiveAction {
  ref: ActionRef
  /** 剩余次数；null = 无限 */
  remaining: number | null
  /** 当前轮次开始时间戳（ms） */
  startedAt: number
  /** 当前轮次耗时快照（ms；换装在下一轮生效） */
  durationMs: number
  /** 效率保底计数器（连续未触发次数；随存档持久化） */
  procMisses: number
}

/** 离线小数结转（仅材料类整数发放需要） */
export interface OfflineCarry {
  items: Record<ItemId, number>
}

export interface TutorialFlags {
  current: number
  progress: number
  completed: number[]
  claimed: number[]
}

export interface GameState {
  version: number
  character: { name: string; createdAt: number }
  /** 技能经验（浮点；数值量化为 0.5 步长，二进制精确） */
  skills: Record<SkillId, number>
  /** 可堆叠材料：itemId -> 数量 */
  materials: Record<ItemId, number>
  /** 全部装备实例（含已装备项） */
  equipment: EquipInstance[]
  /** 已装备：slot -> instanceId */
  slots: Partial<Record<SlotId, number>>
  nextInstanceId: number
  gold: number
  actions: {
    current: ActiveAction | null
    queue: ActiveAction[]
  }
  /** v2.2：伙伴（id → 状态） */
  companions: Record<string, CompanionState>
  /** v2.4：深渊回廊 */
  abyss: AbyssState
  /** v2.3：图鉴与赛季（赛季未解锁时 season.index = -1） */
  codex: CodexState
  season: SeasonState
  /** 队列位总数（1 = 默认；最多 4） */
  queueSlots: number
  /** 符文增益槽（至多 2 个，until 为真实时间戳） */
  buffs: BuffSlot[]
  flags: {
    tutorial: TutorialFlags
    achievements: AchievementFlags
  }
  meta: {
    /** 上次结算时间戳（ms） */
    lastSeenAt: number
    carry: OfflineCarry
    tasks: TaskState
    prestige: PrestigeState
    /** v1.7：自动回收（itemId → 保留数量） */
    autoRecycle: AutoRecycleMap
    /** v1.7：动作预设 */
    loadouts: LoadoutDef[]
    /** v2.1：造装词缀的存档私有盐（阻断外部预计算/垫刀；见 affixes.ts） */
    affixSalt: number
    /** v2.2：远征（进行中/待领取的 run + 旗帜等级） */
    expeditions: ExpeditionState
    /** v2.3：图鉴里程碑已发奖档位（pct 列表，逗号分隔；幂等） */
    codexMilestones: string
    /** v2.3：赛季是否曾经解锁（粘性：传承掉回门槛下仍保持解锁，测评 M2） */
    seasonUnlockedOnce: boolean
    /** v2.5：表现层设置 */
    settings?: SettingsState
    /** v3.0 L2：实例级自动回收的完美度阈值（0~100；0 = 关闭）；低于阈值的非装备实例自动回收 */
    autoRecyclePerfect?: number
    /** v3.1：金币商店购买次数（itemId → 次数），用于价格递增 */
    goldShop?: Record<string, number>
    /** v3.1：装备预设（最多 3 套，深潜/远征/日常各一） */
    gearSets?: GearSetDef[]
  }
  stats: {
    totalCrafts: number
    totalEnhances: number
    totalMines: number
    totalSmelts: number
    totalForges: number
    /** 累计获得金币（单调递增，仅正数入账） */
    totalGoldEarned: number
    totalCratesOpened: number
    totalTasksDone: number
    totalWeekliesDone: number
    totalJewelryForged: number
    totalRunesCrafted: number
    /** v1.5：传承次数与累计精通点 */
    totalPrestiges: number
    totalPrestigePointsEarned: number
    /** v2.1：重铸次数与累计产出的「完美词缀」条数（单调递增） */
    totalReforges: number
    /** v3.1：仅统计 **T4+ 装备**的强化/重铸次数（赛季目标用；防止在 T1 垃圾上刷计数） */
    totalEnhancesT4: number
    totalReforgesT4: number
    perfectAffixes: number
    /** v2.4：深渊统计（单调递增） */
    totalAbyssSweeps: number
    totalAbyssPurchases: number
    /** v2.2：远征/伙伴统计（单调递增） */
    totalExpeditions: number
    totalRecruits: number
    totalRelics: number
    totalTokensEarned: number
  }
}

// ---------- 命令（UI 唯一入口；tick 由壳层定时调用 simulate） ----------

export type Command =
  | { type: 'startAction'; ref: ActionRef; count: number | null; mode: 'now' | 'enqueue' }
  | { type: 'stopAction' }
  | { type: 'clearQueue' }
  | { type: 'equip'; instanceId: number }
  | { type: 'unequip'; slot: SlotId }
  | { type: 'recycleMaterial'; itemId: ItemId; qty: number }
  | { type: 'recycleInstance'; instanceId: number }
  | { type: 'buyQueueSlot' }
  | { type: 'claimTutorial'; step: number }
  | { type: 'openCrate' }
  | { type: 'rerollTask'; index: number }
  | { type: 'useRune'; itemId: ItemId }
  | { type: 'prestige' }
  | { type: 'buyPerk'; perkId: string }
  | { type: 'refundPerk'; perkId: string }
  | { type: 'setAutoRecycle'; itemId: ItemId; keep: number | null }
  /** v3.0 L2：行囊整理（同 id 只留最高完美度） */
  | { type: 'tidyBag' }
  /** v3.0 L2：实例级自动回收阈值（0 = 关闭） */
  | { type: 'setAutoRecyclePerfect'; pct: number }
  | { type: 'saveLoadout'; name: string }
  | { type: 'applyLoadout'; loadoutId: string }
  | { type: 'deleteLoadout'; loadoutId: string }
  /** v2.1：重铸词缀（locks = 保留不重摇的词缀下标） */
  | { type: 'reforge'; instanceId: number; locks: number[]; ticketAffixId?: string }
  /** v2.2：远征 */
  | { type: 'recruitCompanion' }
  | { type: 'rerollTrait'; companionId: string }
  | { type: 'dispatchExpedition'; routeId: string; hours: number; team: string[] }
  | { type: 'claimExpedition'; runId: number }
  | { type: 'upgradeBanner' }
  /** v2.4：深渊回廊 */
  | { type: 'challengeAbyss'; floors?: number }
  | { type: 'sweepAbyss'; count?: number }
  | { type: 'buyAbyssItem'; itemId: string }
  /** v2.5：设置（音效 / 音量 / 特效档位）—— 只写 meta.settings，不触碰任何数值 */
  | { type: 'setSettings'; patch: Partial<SettingsState> }
  /** v3.1：金币商店（金 → 精华/重铸石，价格递增的循环出口） */
  | { type: 'buyGoldShopItem'; id: string }
  /** v3.1：装备预设（保存当前着装 / 一键穿戴 / 删除） */
  | { type: 'saveGearSet'; name: string }
  | { type: 'applyGearSet'; setId: string }
  | { type: 'deleteGearSet'; setId: string }

// ---------- 事件（内核 → UI 回流） ----------

export type GameEvent =
  | { type: 'actionStarted'; ref: ActionRef }
  | { type: 'actionCompleted'; ref: ActionRef; rounds: number }
  | { type: 'actionStopped'; reason: 'user' | 'noMaterials' | 'queueEmpty' }
  | { type: 'itemsGained'; items: { itemId: ItemId; qty: number }[] }
  | { type: 'xpGained'; skill: SkillId; xp: number }
  | { type: 'levelUp'; skill: SkillId; level: number }
  | { type: 'enhanceResult'; instanceId: number; from: number; to: number; success: boolean; guarded?: boolean }
  | { type: 'reforged'; instanceId: number; name: string; before: number; after: number }
  | { type: 'expeditionDispatched'; routeName: string; hours: number }
  | { type: 'expeditionDone'; routeName: string; hours: number; success: boolean; gold: number; expected: boolean }
  | { type: 'expeditionClaimed'; routeName: string; gold: number }
  | { type: 'companionRecruited'; name: string; duplicate: boolean }
  | { type: 'companionLevelUp'; name: string; level: number }
  | { type: 'traitRerolled'; name: string; trait: string }
  | { type: 'bannerUpgraded'; level: number }
  | { type: 'codexMilestone'; pct: number; gold: number; title: string }
  | { type: 'seasonLevelUp'; level: number }
  | { type: 'seasonRotated'; index: number }
  /** v3.0：连打后 floor/clearedTo 为最高层，count 为本次通过层数 */
  | { type: 'abyssCleared'; floor: number; crystals: number; clearedTo: number; count: number; modName: string }
  /** v3.0 批量：crystals 为总量、count 为次数（原 floors 字段已删除：扫荡不改层） */
  | { type: 'abyssSwept'; crystals: number; count: number }
  | { type: 'abyssItemBought'; name: string }
  | { type: 'tutorialGoalMet'; step: number }
  | { type: 'tutorialRewarded'; step: number }
  | { type: 'achievementUnlocked'; id: string; name: string }
  | { type: 'taskCompleted'; title: string }
  | { type: 'tasksRotated'; period: 'daily' | 'weekly' }
  | { type: 'crateOpened'; text: string }
  | { type: 'buffActivated'; name: string; until: number }
  | { type: 'prestigeDone'; points: number }
  | { type: 'perkChanged'; perkId: string }
  | { type: 'loadoutApplied'; name: string }
  | { type: 'goldGained'; amount: number }
  /** v2.5：设置已写入（壳层据此同步音频引擎与特效档位） */
  | { type: 'settingsChanged'; settings: SettingsState }
  /** v2.1：非阻塞提示（如消耗了高词缀装备） */
  | { type: 'notice'; text: string }
  | { type: 'blocked'; reason: string }

// ---------- 离线结算摘要 ----------

export interface OfflineSummary {
  /** v2.2：远征结算摘要 */
  expeditions: { routeName: string; hours: number; success: boolean; gold: number; expected: boolean }[]
  /** v2.3：离线期间达到的赛季等级 / 图鉴里程碑（pct 0~1） */
  seasonLevels: number[]
  codexMilestones: number[]
  /** v3.0：本次离线是否触发了回体上限提升（面板据此提示） */
  staminaBonus: boolean
  elapsedMs: number
  countedMs: number
  rounds: { ref: ActionRef; count: number }[]
  items: { itemId: ItemId; qty: number }[]
  xp: { skill: SkillId; xp: number }[]
  levels: { skill: SkillId; level: number }[]
  notes: string[]
}

export interface StepResult {
  state: GameState
  events: GameEvent[]
}
