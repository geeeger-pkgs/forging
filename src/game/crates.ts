// ============================================================
// Forging · 开箱系统（v1.2；v2.1 追加重铸石档）
// 工匠小箱开启：掉落表 EV ≈ 40 金（回收价 25，开启为更优选择）
// 掉表：大奖 300 @3% / 金币 20~50 @42% / 精华 1~2 @35% / 煤 8~16 @15% / 重铸石 1 @5%
// 约定：分支阈值单调，新增档位一律追加在尾部（不影响既有判定与既有测试）
// ============================================================
import { itemDef } from './content'
import { randInt, systemRng, type Rng } from './rng'
import { addGold, addMaterial, materialCount, removeMaterial } from './state'
import type { GameEvent, GameState } from './types'

const CRATE_ID = 'crate'

/** 开启 1 个工匠小箱；不足或未持有时返回 blocked */
export function openCrate(state: GameState, rng: Rng = systemRng()): GameEvent[] {
  if (materialCount(state, CRATE_ID) < 1) {
    return [{ type: 'blocked', reason: '没有可开启的工匠小箱' }]
  }
  removeMaterial(state, CRATE_ID, 1)
  state.stats.totalCratesOpened += 1

  const r = rng.next()
  const events: GameEvent[] = []

  if (r < 0.03) {
    addGold(state, 300)
    events.push({ type: 'goldGained', amount: 300 })
    events.push({ type: 'crateOpened', text: '📦 大奖！金币 ×300' })
  } else if (r < 0.03 + 0.42) {
    const gold = randInt(rng, 20, 50)
    addGold(state, gold)
    events.push({ type: 'goldGained', amount: gold })
    events.push({ type: 'crateOpened', text: `📦 金币 ×${gold}` })
  } else if (r < 0.03 + 0.42 + 0.35) {
    const qty = randInt(rng, 1, 2)
    addMaterial(state, 'essence', qty)
    events.push({ type: 'itemsGained', items: [{ itemId: 'essence', qty }] })
    events.push({ type: 'crateOpened', text: `📦 ${itemDef('essence').name} ×${qty}` })
  } else if (r < 0.03 + 0.42 + 0.35 + 0.15) {
    const qty = randInt(rng, 8, 16)
    addMaterial(state, 'coal', qty)
    events.push({ type: 'itemsGained', items: [{ itemId: 'coal', qty }] })
    events.push({ type: 'crateOpened', text: `📦 ${itemDef('coal').name} ×${qty}` })
  } else {
    addMaterial(state, 'emberstone', 1)
    events.push({ type: 'itemsGained', items: [{ itemId: 'emberstone', qty: 1 }] })
    events.push({ type: 'crateOpened', text: `📦 ${itemDef('emberstone').name} ×1` })
  }
  return events
}
