// ============================================================
// Forging · 装备属性聚合（设计 §7 速度来源 / §9 强化附加）
// 规则：
//   - 工具（镐/坩埚/锤）速度只作用于对应技能
//   - 战锤等「全技能速度」作用于所有技能
//   - 强化附加：工具 ×(1 + 2.9%×n)；非工具主属性 ×(1 + 5%×n)
//   - v1.3：饰品（项链=强化成功率 / 戒指=效率）
//   - v1.2 套装：≥5 件同档 +4% 全速；8 件同档再 +4% 效率
//   - v2.1 词缀：加法并入同一池；词缀不受强化倍率放大（强化与词缀为两条独立轴）
// ============================================================
import { affixBonusOf } from './affixes'
import { buffBonuses } from './buffs'
import { CONTENT, itemDef } from './content'
import { perkBonuses } from './prestige'
import { skillOf } from './refs'
import type { ActionRef, GameState, SlotId } from './types'

export const SLOT_IDS: readonly SlotId[] = [
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

const ENH_TOOL = 0.029
const ENH_OTHER = 0.05

/** 工具槽位 → 对应技能 */
const TOOL_SKILL: Partial<Record<SlotId, 'mining' | 'smelting' | 'forging'>> = {
  pick: 'mining',
  crucible: 'smelting',
  hammer: 'forging',
}

export interface AggregatedStats {
  /** 各技能的工具速度加成 */
  toolSpeed: Record<'mining' | 'smelting' | 'forging', number>
  /** 全技能速度（战锤等） */
  allSpeed: number
  efficiency: number
  quantity: number
  wisdom: number
  rareFind: number
  /** 强化成功率加成（v1.3 饰品） */
  enhanceRate: number
  /** v2.1 词缀：强化失败不降级概率 */
  guard: number
  /** v2.1 词缀：回收收益加成 */
  goldFind: number
  /** v2.1 词缀：重铸石掉落加成 */
  stoneFind: number
  /** 套装（v1.2）：件数最多的同档位（≥3 时展示） */
  setTier: number | null
  setCount: number
}

export function aggregateEquipment(state: GameState): AggregatedStats {
  const agg: AggregatedStats = {
    toolSpeed: { mining: 0, smelting: 0, forging: 0 },
    allSpeed: 0,
    efficiency: 0,
    quantity: 0,
    wisdom: 0,
    rareFind: 0,
    enhanceRate: 0,
    guard: 0,
    goldFind: 0,
    stoneFind: 0,
    setTier: null,
    setCount: 0,
  }
  const tierCount = new Map<number, number>()
  for (const slot of SLOT_IDS) {
    const instId = state.slots[slot]
    if (instId === undefined) continue
    const inst = state.equipment.find((e) => e.instanceId === instId)
    if (!inst) continue
    const def = itemDef(inst.itemId)
    if (def.tier) tierCount.set(def.tier, (tierCount.get(def.tier) ?? 0) + 1)
    const s = def.stats
    if (s) {
      const enhMult = def.category === 'tool' ? 1 + ENH_TOOL * inst.enhanceLevel : 1 + ENH_OTHER * inst.enhanceLevel
      if (s.speed) {
        const toolSkill = TOOL_SKILL[slot]
        if (toolSkill) agg.toolSpeed[toolSkill] += s.speed * enhMult
        else agg.allSpeed += s.speed * enhMult
      }
      if (s.efficiency) agg.efficiency += s.efficiency * enhMult
      if (s.quantity) agg.quantity += s.quantity * enhMult
      if (s.wisdom) agg.wisdom += s.wisdom * enhMult
      if (s.rareFind) agg.rareFind += s.rareFind * enhMult
      if (s.successRate) agg.enhanceRate += s.successRate * enhMult
    }

    // v2.1 词缀：加法并入，不乘强化倍率（两条独立成长轴）
    const affix = affixBonusOf(inst.affixes ?? [])
    if (affix.speed) {
      const toolSkill = TOOL_SKILL[slot]
      if (toolSkill) agg.toolSpeed[toolSkill] += affix.speed
      else agg.allSpeed += affix.speed
    }
    agg.efficiency += affix.efficiency
    agg.quantity += affix.quantity
    agg.wisdom += affix.wisdom
    agg.rareFind += affix.rareFind
    agg.enhanceRate += affix.enhanceRate
    agg.guard += affix.guard
    agg.goldFind += affix.goldFind
    agg.stoneFind += affix.stoneFind
  }

  // 套装加成（v1.2 重设计）：件数最多的同档装备
  //   ≥3 件：展示进度；≥5 件：+4% 全技能速度；8 件（含饰品最多 10 件）：再 +4% 效率
  let bestTier: number | null = null
  let bestCount = 0
  for (const [tier, count] of tierCount) {
    if (count > bestCount) {
      bestTier = tier
      bestCount = count
    }
  }
  // v2.4：深渊商店的永久速度（与既有加法池同源；战力与时长都从这里读）
  const abyssDef = CONTENT.abyss
  const permLevel = state.abyss?.permanentSpeed ?? 0
  if (permLevel > 0) {
    const perLevel = abyssDef.shop.find((x: { id: string; perLevel?: number }) => x.id === 'permanent_speed')?.perLevel ?? 0
    agg.allSpeed += perLevel * permLevel
  }
  // v3.4 A2：Lv76~100 里程碑（每 5 级一条永久被动，按**历史最高技能等级**解锁；
  // 与词缀/符文/精通同池相加，不新增乘区 —— 单源聚合，面板与结算都从这里读）
  for (const m of CONTENT.levelCurve.milestones ?? []) {
    if (state.meta.bestSkillLevel < m.level) continue
    if (m.stat === 'allSpeed') agg.allSpeed += m.value
    else if (m.stat === 'quantity') agg.quantity += m.value
    else if (m.stat === 'wisdom') agg.wisdom += m.value
    else if (m.stat === 'rareFind') agg.rareFind += m.value
    else if (m.stat === 'efficiency') agg.efficiency += m.value
  }
  agg.setTier = bestCount >= 3 ? bestTier : null
  agg.setCount = bestCount
  if (bestCount >= 5) agg.allSpeed += 0.04
  if (bestCount >= 8) agg.efficiency += 0.04
  return agg
}

/**
 * 某动作的技能速度加成合计（0.15 = +15%；含 v1.4 符文增益）。
 * v3.0 C12：`now` 可注入（缺省 Date.now()）—— 符文增益是时间函数，
 * 注入后可写出"同一存档同一时刻必得同一结果"的确定性断言（与 abyssScore 同口径）。
 */
export function speedFor(state: GameState, ref: ActionRef, now: number = Date.now()): number {
  const agg = aggregateEquipment(state)
  const skill = skillOf(ref)
  let bonus = agg.allSpeed
  if (skill === 'mining') bonus += agg.toolSpeed.mining
  else if (skill === 'smelting') bonus += agg.toolSpeed.smelting
  else if (skill === 'forging') bonus += agg.toolSpeed.forging
  bonus += buffBonuses(state, now).speed
  bonus += perkBonuses(state).speed
  return bonus
}

// ---------------- v3.4 A1：有效属性（面板与结算同源） ----------------
export interface EffectiveStats {
  efficiency: number
  rareFind: number
  wisdom: number
  /** v3.4.4：强化成功率（装备 + 符文） */
  enhanceRate: number
  /** v3.4.5：重铸石额外掉率（勘探词缀；仅对重铸石生效） */
  stoneFind: number
  /** 三技能的动作速度（已含 allSpeed + 符文 + 精通） */
  toolSpeed: { mining: number; smelting: number; forging: number }
}

/**
 * **面板与结算共用的有效属性**。
 * 起因（v3.0 硬核评审 P0-1，挂了 v3.2/v3.3 两版）：在线效率 proc 只读装备侧
 * （`aggregateEquipment(state).efficiency`），而面板同样只显示装备侧 —— 结果是
 * **丰饶符文/效率精通"看得见、挖不动"**（激活后产量与节奏毫无变化，只在深渊战力里体现）。
 * 本函数把三处口径统一为：装备 + 符文（临时，离线期间为 0）+ 精通（永久）。
 * 结算侧（settle.ts 的在线 proc / 离线期望）与展示侧（RightPanel）都必须走这里。
 */
export function effectiveStats(state: GameState, now: number = Date.now()): EffectiveStats {
  const agg = aggregateEquipment(state)
  const buff = buffBonuses(state, now)
  const perk = perkBonuses(state)
  const allSpeed = agg.allSpeed + buff.speed + perk.speed
  return {
    efficiency: agg.efficiency + buff.efficiency + perk.efficiency,
    rareFind: agg.rareFind + buff.rareFind + perk.rareFind,
    wisdom: agg.wisdom + perk.wisdom,
    // v3.4.4：强化成功率也并入有效属性（agg + 符文；精通无该效果）——此前面板只读装备侧
    enhanceRate: agg.enhanceRate + buff.enhanceRate,
    stoneFind: agg.stoneFind,
    toolSpeed: {
      mining: agg.toolSpeed.mining + allSpeed,
      smelting: agg.toolSpeed.smelting + allSpeed,
      forging: agg.toolSpeed.forging + allSpeed,
    },
  }
}

/** 有效效率（在线 proc 与面板共用；单独暴露便于测试与调用点可读） */
export function effectiveEfficiency(state: GameState, now: number = Date.now()): number {
  return effectiveStats(state, now).efficiency
}
