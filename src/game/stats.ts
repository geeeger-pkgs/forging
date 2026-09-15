// ============================================================
// Forging · 装备属性聚合（设计 §7 速度来源 / §9 强化附加）
// 规则：
//   - 工具（镐/坩埚/锤）速度只作用于对应技能
//   - 战锤等「全技能速度」作用于所有技能
//   - 强化附加：工具 ×(1 + 2.9%×n)；非工具主属性 ×(1 + 5%×n)
// ============================================================
import { itemDef } from './content'
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
    if (!s) continue
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
  }

  // 套装加成（v1.2 重设计）：件数最多的同档装备
  //   ≥3 件：展示进度；≥5 件：+4% 全技能速度；8 件（全套）：再 +4% 效率
  let bestTier: number | null = null
  let bestCount = 0
  for (const [tier, count] of tierCount) {
    if (count > bestCount) {
      bestTier = tier
      bestCount = count
    }
  }
  agg.setTier = bestCount >= 3 ? bestTier : null
  agg.setCount = bestCount
  if (bestCount >= 5) agg.allSpeed += 0.04
  if (bestCount >= 8) agg.efficiency += 0.04
  return agg
}

/** 某动作的技能速度加成合计（0.15 = +15%） */
export function speedFor(state: GameState, ref: ActionRef): number {
  const agg = aggregateEquipment(state)
  const skill = skillOf(ref)
  let bonus = agg.allSpeed
  if (skill === 'mining') bonus += agg.toolSpeed.mining
  else if (skill === 'smelting') bonus += agg.toolSpeed.smelting
  else if (skill === 'forging') bonus += agg.toolSpeed.forging
  return bonus
}
