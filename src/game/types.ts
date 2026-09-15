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
    perfectAffixes: number
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
  | { type: 'acceptTutorial'; step: number }
  | { type: 'claimTutorial'; step: number }
  | { type: 'openCrate' }
  | { type: 'rerollTask'; index: number }
  | { type: 'useRune'; itemId: ItemId }
  | { type: 'prestige' }
  | { type: 'buyPerk'; perkId: string }
  | { type: 'refundPerk'; perkId: string }
  | { type: 'setAutoRecycle'; itemId: ItemId; keep: number | null }
  | { type: 'saveLoadout'; name: string }
  | { type: 'applyLoadout'; loadoutId: string }
  | { type: 'deleteLoadout'; loadoutId: string }
  /** v2.1：重铸词缀（locks = 保留不重摇的词缀下标） */
  | { type: 'reforge'; instanceId: number; locks: number[] }
  /** v2.2：远征 */
  | { type: 'recruitCompanion' }
  | { type: 'rerollTrait'; companionId: string }
  | { type: 'dispatchExpedition'; routeId: string; hours: number; team: string[] }
  | { type: 'claimExpedition'; runId: number }
  | { type: 'upgradeBanner' }

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
  /** v2.1：非阻塞提示（如消耗了高词缀装备） */
  | { type: 'notice'; text: string }
  | { type: 'blocked'; reason: string }

// ---------- 离线结算摘要 ----------

export interface OfflineSummary {
  /** v2.2：远征结算摘要 */
  expeditions: { routeName: string; hours: number; success: boolean; gold: number; expected: boolean }[]
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
