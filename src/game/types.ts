// ============================================================
// Forging · 内核类型契约（v1.5）
// 规则：
//   - 本文件是【内核线（src/game）】与【壳线（src/app、src/ui）】唯一接口
//   - 内核纯函数：无 DOM、无 Vue、可单测、可序列化
// ============================================================

// ---------- 基础枚举 ----------

export type SkillId = 'mining' | 'smelting' | 'forging' | 'enhancing'

export type Tier = 1 | 2 | 3 | 4 | 5

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
  config: ConfigDef
}

// ---------- 运行时状态（存档 schema） ----------

/** 装备实例（独立于堆叠材料；每件有唯一 instanceId） */
export interface EquipInstance {
  instanceId: number
  itemId: ItemId
  enhanceLevel: number
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

// ---------- 事件（内核 → UI 回流） ----------

export type GameEvent =
  | { type: 'actionStarted'; ref: ActionRef }
  | { type: 'actionCompleted'; ref: ActionRef; rounds: number }
  | { type: 'actionStopped'; reason: 'user' | 'noMaterials' | 'queueEmpty' }
  | { type: 'itemsGained'; items: { itemId: ItemId; qty: number }[] }
  | { type: 'xpGained'; skill: SkillId; xp: number }
  | { type: 'levelUp'; skill: SkillId; level: number }
  | { type: 'enhanceResult'; instanceId: number; from: number; to: number; success: boolean }
  | { type: 'tutorialGoalMet'; step: number }
  | { type: 'tutorialRewarded'; step: number }
  | { type: 'achievementUnlocked'; id: string; name: string }
  | { type: 'taskCompleted'; title: string }
  | { type: 'tasksRotated'; period: 'daily' | 'weekly' }
  | { type: 'crateOpened'; text: string }
  | { type: 'buffActivated'; name: string; until: number }
  | { type: 'prestigeDone'; points: number }
  | { type: 'perkChanged'; perkId: string }
  | { type: 'goldGained'; amount: number }
  | { type: 'blocked'; reason: string }

// ---------- 离线结算摘要 ----------

export interface OfflineSummary {
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
