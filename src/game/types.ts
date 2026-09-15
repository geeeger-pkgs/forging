// ============================================================
// Forging · 内核类型契约（M1 接口冻结稿）
// 规则：
//   - 本文件是【内核线（src/game）】与【壳线（src/app、src/ui）】唯一接口
//   - 内核纯函数：无 DOM、无 Vue、可单测、可序列化
//   - M1 出口后破坏性变更须评审（docs/03-tech-design-v0.1.md §2）
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

/** 装备槽位（设计 §8，共 8 槽） */
export type SlotId =
  | 'pick'
  | 'crucible'
  | 'hammer'
  | 'mainHand'
  | 'head'
  | 'body'
  | 'legs'
  | 'feet'

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
}

export interface ItemDef {
  id: ItemId
  name: string
  /** 材料类（煤/精华/小箱）无档位 */
  tier?: Tier
  category: ItemCategory
  /** tool / weapon / armor 才有 */
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

/** 配方（熔炼 / 锻造） */
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
  cost: { itemId: ItemId; qty: number }[]
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
}

export interface SkillDef {
  id: SkillId
  name: string
  maxLevel: number
}

export interface ContentTables {
  skills: SkillDef[]
  ores: OreSiteDef[]
  items: Record<ItemId, ItemDef>
  recipes: RecipeDef[]
  levelCurve: LevelCurveDef
  enhance: EnhanceStepDef[]
  tutorial: TutorialStepDef[]
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
}

/** 离线小数结转（仅材料类整数发放需要） */
export interface OfflineCarry {
  items: Record<ItemId, number>
}

export interface TutorialFlags {
  /** 当前已接受、进行中的步骤；10 = 全部完成 */
  current: number
  /** 目标已达成（待领奖） */
  completed: number[]
  /** 已领取奖励 */
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
  flags: {
    tutorial: TutorialFlags
  }
  meta: {
    /** 上次结算时间戳（ms） */
    lastSeenAt: number
    carry: OfflineCarry
  }
  stats: {
    totalCrafts: number
    totalEnhances: number
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
  | { type: 'goldGained'; amount: number }
  | { type: 'blocked'; reason: string }

// ---------- 离线结算摘要 ----------

export interface OfflineSummary {
  /** 实际离线时长（ms，原始） */
  elapsedMs: number
  /** 计入结算的时长（ms，cap 后） */
  countedMs: number
  rounds: { ref: ActionRef; count: number }[]
  items: { itemId: ItemId; qty: number }[]
  xp: { skill: SkillId; xp: number }[]
  levels: { skill: SkillId; level: number }[]
  notes: string[]
}

// ---------- 结算与命令返回 ----------

export interface StepResult {
  state: GameState
  events: GameEvent[]
}
