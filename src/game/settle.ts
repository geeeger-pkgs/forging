// ============================================================
// Forging · 结算引擎（惰性推进 + 双模式）
// 约定：原地修改传入的 state；调用方持有可变更副本
// 模式：
//   online      真实随机（效率 proc / 掉落 roll / 强化判定）
//   expectation 期望 + 小数结转（离线结算；强化被排除）
// 执行管道（设计 §4）：完成判定 → 效率 proc → 产出/掉落 → XP → 升级 → 教程 → 队列启动
// ============================================================
import { REFORGE_STONE, perfectScore } from './affixes'
import { buffBonuses } from './buffs'
import { perkBonuses } from './prestige'
import { ENHANCE_BY_TARGET, MAX_ENHANCE, RECIPES_BY_ID, itemDef } from './content'
import { levelInfo } from './level'
import { randInt, systemRng, type Rng } from './rng'
import { durationOf, enhanceCostFor, rareDropsOf, yieldRangeOf, xpOf } from './rules'
import { addInstance, addMaterial, freeInstances, instanceById, materialCount, removeMaterial } from './state'
import { aggregateEquipment } from './stats'
import { tutorialCheckTotalLevel, tutorialProgress } from './tutorial'
import type {
  ActionRef,
  ActiveAction,
  GameEvent,
  GameState,
  ItemId,
  RareDrop,
  SkillId,
} from './types'

export interface SimulateOptions {
  mode: 'online' | 'expectation'
  rng?: Rng
  events?: GameEvent[]
  maxRounds?: number
}

/** 消耗装备时的「高价值」提示阈值（完美度 ≥ 70% 或强化 ≥ +5） */
const PRECIOUS_SCORE = 0.7
const PRECIOUS_ENHANCE = 5

/** 惰性推进：处理 [当前时间, now] 内所有可完成的动作轮次 */
export function simulate(state: GameState, now: number, opts: SimulateOptions): GameEvent[] {
  const events = opts.events ?? []
  const rng = opts.rng ?? systemRng()
  const maxRounds = opts.maxRounds ?? 500_000
  let rounds = 0

  while (state.actions.current && rounds < maxRounds) {
    const act = state.actions.current
    act.durationMs = durationOf(state, act.ref) // 每轮按当前装备重算（换装下一轮生效）
    const completeAt = act.startedAt + act.durationMs
    if (completeAt > now) break
    act.startedAt = completeAt
    rounds++

    const ok = performRound(state, act, events, opts.mode, rng)
    if (!ok) {
      // 阻塞：停止当前动作；队列保留待玩家手动重启（设计 §13）
      state.actions.current = null
      break
    }
    if (act.remaining !== null) {
      act.remaining -= 1
      if (act.remaining <= 0) {
        state.actions.current = null
        advanceQueue(state, completeAt, events)
      }
    }
  }

  if (rounds >= maxRounds) events.push({ type: 'blocked', reason: '结算轮次达到保护上限，已暂停' })
  state.meta.lastSeenAt = Math.max(state.meta.lastSeenAt, now)
  return events
}

function advanceQueue(state: GameState, at: number, events: GameEvent[]): void {
  const next = state.actions.queue.shift()
  if (!next) {
    events.push({ type: 'actionStopped', reason: 'queueEmpty' })
    return
  }
  next.startedAt = at
  next.durationMs = durationOf(state, next.ref)
  state.actions.current = next
  events.push({ type: 'actionStarted', ref: next.ref })
}

// ---------------- 单轮执行 ----------------

function performRound(
  state: GameState,
  act: ActiveAction,
  events: GameEvent[],
  mode: 'online' | 'expectation',
  rng: Rng,
): boolean {
  const ref = act.ref
  if (ref.kind === 'enhance') return performEnhance(state, act, events, mode, rng)

  const ok = applyRewards(state, ref, events, mode, rng)
  if (!ok) return false
  events.push({ type: 'actionCompleted', ref, rounds: 1 })

  if (mode === 'online') {
    // 效率：概率触发「立即免费重复一次」；保底 ⌈1/E⌉ 次必触发（链式上限 1）
    const E = aggregateEquipment(state).efficiency
    if (E > 0) {
      act.procMisses += 1
      const need = Math.ceil(1 / E)
      const fire = act.procMisses >= need || rng.next() < E
      if (fire) {
        act.procMisses = 0
        applyRewards(state, ref, events, mode, rng)
      }
    }
  }
  return true
}

/** 单轮奖励（采矿 / 配方）：产出、稀有掉落、XP、教程；失败返回 false（已发事件） */
function applyRewards(
  state: GameState,
  ref: ActionRef,
  events: GameEvent[],
  mode: 'online' | 'expectation',
  rng: Rng,
): boolean {
  const agg = aggregateEquipment(state)
  // v1.4：在线模式叠加符文增益（离线结算期间 buffs 被临时清空 → 自动为 0）
  const buff = buffBonuses(state, Date.now())
  // v1.5：精通加成（永久，离线同样生效）
  const perk = perkBonuses(state)
  const eff = agg.efficiency + buff.efficiency + perk.efficiency
  const rare = agg.rareFind + buff.rareFind + perk.rareFind
  const wisdom = agg.wisdom + perk.wisdom

  if (ref.kind === 'mine') {
    state.stats.totalMines += 1
    const { min, max, itemId } = yieldRangeOf(ref.siteId)
    if (mode === 'online') {
      const base = randInt(rng, min, max)
      const qty = Math.round(base * (1 + agg.quantity))
      grantItem(state, itemId, qty, events)
      events.push(...tutorialProgress(state, 'mineItem', qty, { itemId }))
    } else {
      const expected = ((min + max) / 2) * (1 + agg.quantity) * (1 + eff)
      grantExpected(state, itemId, expected, events)
      events.push(...tutorialProgress(state, 'mineItem', Math.floor(expected), { itemId }))
    }
    grantRareDrops(state, rareDropsOf(ref), rare, mode, rng, events, agg.stoneFind)
    const xpMul = (1 + wisdom) * (mode === 'expectation' ? 1 + eff : 1)
    grantXp(state, 'mining', xpOf(ref) * xpMul, events)
    events.push(...tutorialCheckTotalLevel(state))
    return true
  }

  // craft（enhance 已由 performRound 分派，不会进入此分支）
  if (ref.kind !== 'craft') {
    events.push({ type: 'blocked', reason: '非法动作引用' })
    return false
  }
  const recipe = RECIPES_BY_ID.get(ref.recipeId)
  if (!recipe) {
    events.push({ type: 'blocked', reason: `未知配方: ${ref.recipeId}` })
    events.push({ type: 'actionStopped', reason: 'noMaterials' })
    return false
  }
  if (!consumeInputs(state, recipe.inputs, events)) return false

  for (const out of recipe.outputs) {
    if (mode === 'online') {
      const def = itemDef(out.itemId)
      if (def.stackable) {
        const qty = Math.round(out.qty * (1 + agg.quantity))
        grantItem(state, out.itemId, qty, events)
      } else {
        for (let i = 0; i < out.qty; i++) addInstance(state, out.itemId)
        events.push({ type: 'itemsGained', items: [{ itemId: out.itemId, qty: out.qty }] })
      }
      events.push(...tutorialProgress(state, 'craftItem', out.qty, { itemId: out.itemId }))
    } else {
      grantExpected(state, out.itemId, out.qty * (1 + agg.quantity) * (1 + eff), events)
      events.push(
        ...tutorialProgress(state, 'craftItem', Math.floor(out.qty * (1 + agg.quantity)), { itemId: out.itemId }),
      )
    }
  }
  grantRareDrops(state, recipe.rareDrops, rare, mode, rng, events, agg.stoneFind)
  const xpMul = (1 + wisdom) * (mode === 'expectation' ? 1 + eff : 1)
  grantXp(state, recipe.skill, xpOf(ref) * xpMul, events)
  state.stats.totalCrafts += 1
  if (recipe.skill === 'smelting') state.stats.totalSmelts += 1
  else if (recipe.skill === 'forging') state.stats.totalForges += 1
  if (recipe.category === 'jewelry') state.stats.totalJewelryForged += 1
  if (recipe.category === 'rune') state.stats.totalRunesCrafted += 1
  events.push(...tutorialCheckTotalLevel(state))
  return true
}

/** 强化单轮：消耗 → 判定 → 等级变化 → XP → 教程（期望模式不支持，返回 false） */
function performEnhance(
  state: GameState,
  act: ActiveAction,
  events: GameEvent[],
  mode: 'online' | 'expectation',
  rng: Rng,
): boolean {
  const ref = act.ref
  if (ref.kind !== 'enhance') return false
  const inst = instanceById(state, ref.instanceId)
  if (!inst) {
    events.push({ type: 'blocked', reason: '被强化物品已不存在' })
    events.push({ type: 'actionStopped', reason: 'noMaterials' })
    return false
  }
  const step = ENHANCE_BY_TARGET.get(ref.targetLevel)
  if (!step || inst.enhanceLevel + 1 !== ref.targetLevel) {
    events.push({ type: 'blocked', reason: '物品当前等级与强化目标不匹配' })
    events.push({ type: 'actionStopped', reason: 'noMaterials' })
    return false
  }
  const cost = enhanceCostFor(inst.itemId, ref.targetLevel)
  for (const c of cost) {
    if (materialCount(state, c.itemId) < c.qty) {
      events.push({ type: 'blocked', reason: `材料不足：${itemDef(c.itemId).name} ×${c.qty}` })
      events.push({ type: 'actionStopped', reason: 'noMaterials' })
      return false
    }
  }
  if (mode === 'expectation') {
    events.push({ type: 'blocked', reason: '强化动作不参与离线结算' })
    return false
  }
  for (const c of cost) removeMaterial(state, c.itemId, c.qty)

  // v1.3/v1.4：强化成功率 = 档位基础 + 饰品加成 + 祝福符文增益（上限 100%）
  const agg = aggregateEquipment(state)
  const rate = Math.min(1, step.successRate + agg.enhanceRate + buffBonuses(state, Date.now()).enhanceRate)
  const success = rng.next() < rate
  const from = inst.enhanceLevel
  let to = from
  // v2.1：庇护词缀——失败且该档降级时，按庇护概率免降级（仅对降级档生效）
  let guarded = false
  if (success) {
    to = from + 1
  } else if (step.downgrade) {
    if (agg.guard > 0 && rng.next() < Math.min(1, agg.guard)) guarded = true
    else to = Math.max(0, from - 1)
  }
  inst.enhanceLevel = to
  state.stats.totalEnhances += 1
  events.push({ type: 'enhanceResult', instanceId: ref.instanceId, from, to, success, guarded })

  // 连续强化链（v1.2）：每轮自动重臂到「当前等级 + 1」；失败降级自动跟随
  // 到达 +10 后本轮结束（remaining 收敛为 1，避免下一轮以“已达上限”报错停止）
  if (inst.enhanceLevel >= MAX_ENHANCE) {
    act.remaining = act.remaining === null ? 1 : Math.min(act.remaining, 1)
  } else {
    act.ref = { kind: 'enhance', instanceId: ref.instanceId, targetLevel: inst.enhanceLevel + 1 }
  }

  grantXp(state, 'enhancing', step.xpBase * (success ? 2 : 1) * (1 + agg.wisdom), events)
  if (success) events.push(...tutorialProgress(state, 'enhanceInstance', 1))
  events.push({ type: 'actionCompleted', ref, rounds: 1 })
  events.push(...tutorialCheckTotalLevel(state))
  return true
}

// ---------------- 发放与消耗 ----------------

function grantItem(state: GameState, itemId: ItemId, qty: number, events: GameEvent[]): void {
  if (qty <= 0) return
  addMaterial(state, itemId, qty)
  events.push({ type: 'itemsGained', items: [{ itemId, qty }] })
}

/** 期望模式发放：整数发放 + 小数结转（材料与装备通用） */
function grantExpected(state: GameState, itemId: ItemId, expectedQty: number, events: GameEvent[]): void {
  if (expectedQty <= 0) return
  const carry = state.meta.carry.items
  const total = (carry[itemId] ?? 0) + expectedQty
  const whole = Math.floor(total)
  carry[itemId] = total - whole
  if (whole <= 0) return
  const def = itemDef(itemId)
  if (def.stackable) {
    addMaterial(state, itemId, whole)
  } else {
    for (let i = 0; i < whole; i++) addInstance(state, itemId)
  }
  events.push({ type: 'itemsGained', items: [{ itemId, qty: whole }] })
}

function grantRareDrops(
  state: GameState,
  drops: readonly RareDrop[],
  rareFind: number,
  mode: 'online' | 'expectation',
  rng: Rng,
  events: GameEvent[],
  stoneFind = 0,
): void {
  for (const rd of drops) {
    // v2.1：勘探词缀只加权重铸石掉落（与通用稀有加成叠乘）
    const extra = rd.itemId === REFORGE_STONE ? stoneFind : 0
    const rate = rd.rate * (1 + rareFind + extra)
    if (mode === 'online') {
      if (rng.next() < rate) grantItem(state, rd.itemId, 1, events)
    } else {
      grantExpected(state, rd.itemId, rate, events)
    }
  }
}

function grantXp(state: GameState, skill: SkillId, amount: number, events: GameEvent[]): void {
  if (amount <= 0) return
  const before = levelInfo(state.skills[skill]).level
  state.skills[skill] += amount
  events.push({ type: 'xpGained', skill, xp: amount })
  const after = levelInfo(state.skills[skill]).level
  for (let l = before + 1; l <= after; l++) events.push({ type: 'levelUp', skill, level: l })
}

/** 检查并扣除配方输入（材料 + 未装备的装备实例）；不足则返回 false（已发事件） */
function consumeInputs(
  state: GameState,
  inputs: readonly { itemId: ItemId; qty: number }[],
  events: GameEvent[],
): boolean {
  for (const inp of inputs) {
    const def = itemDef(inp.itemId)
    if (def.stackable) {
      if (materialCount(state, inp.itemId) < inp.qty) {
        events.push({ type: 'blocked', reason: `材料不足：${def.name} ×${inp.qty}` })
        events.push({ type: 'actionStopped', reason: 'noMaterials' })
        return false
      }
    } else {
      const free = freeInstances(state, inp.itemId)
      if (free.length < inp.qty) {
        events.push({ type: 'blocked', reason: `缺少可用装备：${def.name}（装备中不可消耗，请先卸下）` })
        events.push({ type: 'actionStopped', reason: 'noMaterials' })
        return false
      }
    }
  }
  for (const inp of inputs) {
    const def = itemDef(inp.itemId)
    if (def.stackable) {
      removeMaterial(state, inp.itemId, inp.qty)
    } else {
      // v2.1（评审 B5）：优先消耗「词缀最差、其次强化最低」的同类实例。
      // 取舍说明：词缀是稀缺资产（重铸石 + 真随机，且无法用材料复现），强化等级可用材料重跑，
      // 因此词缀优先级更高；两者任一偏高时给出非阻塞提示，避免资产被静默销毁。
      const targets = freeInstances(state, inp.itemId)
        .sort(
          (a, b) =>
            perfectScore(a.itemId, a.affixes ?? []) - perfectScore(b.itemId, b.affixes ?? []) ||
            a.enhanceLevel - b.enhanceLevel,
        )
        .slice(0, inp.qty)
      for (const t of targets) {
        const idx = state.equipment.findIndex((e) => e.instanceId === t.instanceId)
        if (idx >= 0) state.equipment.splice(idx, 1)
      }
      for (const t of targets) {
        const score = perfectScore(t.itemId, t.affixes ?? [])
        if (score >= PRECIOUS_SCORE || t.enhanceLevel >= PRECIOUS_ENHANCE) {
          const why = score >= PRECIOUS_SCORE ? `完美度 ${Math.round(score * 100)}%` : `强化 +${t.enhanceLevel}`
          events.push({ type: 'notice', text: `⚠ 消耗了高价值装备：${itemDef(t.itemId).name} +${t.enhanceLevel}（${why}）` })
        }
      }
    }
  }
  return true
}
