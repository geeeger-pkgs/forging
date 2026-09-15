import { describe, expect, it } from 'vitest'
import {
  checkCodexBackfill,
  checkCodexMilestones,
  codexIds,
  codexMilestonesClaimed,
  codexProgress,
  recordAffix,
  recordItem,
  recordOre,
  recordRecipe,
} from '../src/game/codex'
import { applyCommand } from '../src/game/commands'
import { CONTENT, itemDef } from '../src/game/content'
import { sweepAutoRecycle } from '../src/game/automation'
import { settleOffline } from '../src/game/offline'
import { checkSeason, pickSeasonTasks, refreshSeason, seasonUnlocked } from '../src/game/season'
import { mulberry32 } from '../src/game/rng'
import { simulate } from '../src/game/settle'
import { addInstance, addMaterial, newGame } from '../src/game/state'
import type { GameEvent, GameState } from '../src/game/types'

const SEASON_DEF = CONTENT.season

function startCraft(s: GameState, recipeId: string, count: number | null, at = 0): void {
  s.actions.current = { ref: { kind: 'craft', recipeId }, remaining: count, startedAt: at, durationMs: 0, procMisses: 0 }
}

describe('图鉴登记（C1/C2/C3）', () => {
  it('C1：材料入库即登记（源头 addMaterial）', () => {
    const s = newGame('T', 0)
    expect(codexIds(s, 'items').has('ore_copper')).toBe(false)
    addMaterial(s, 'ore_copper', 1)
    expect(codexIds(s, 'items').has('ore_copper')).toBe(true)
    // 消耗后仍保留
    applyCommand(s, { type: 'recycleMaterial', itemId: 'ore_copper', qty: 1 }, 0)
    expect(s.materials['ore_copper']).toBeUndefined()
    expect(codexIds(s, 'items').has('ore_copper')).toBe(true)
  })

  it('C1b：装备实例同理（造装/奖励发放路径统一走 addInstance）', () => {
    const s = newGame('T', 0)
    addInstance(s, 'pick_copper')
    expect(codexIds(s, 'items').has('pick_copper')).toBe(true)
  })

  it('C2：自动回收开启（keep:0）时，采集物仍被登记（次序契约回归）', () => {
    const s = newGame('T', 0)
    s.meta.autoRecycle['ore_copper'] = 0
    startCraft(s, 'smelt_copper', null)
    addMaterial(s, 'ore_copper', 10) // 走真实入库路径（源头登记）
    const events = simulate(s, 60_000, { mode: 'online', rng: mulberry32(1) })
    void events
    // 自动回收把矿石卖掉（离线产出同理），但图鉴已在入库瞬间登记
    sweepAutoRecycle(s)
    expect(s.materials['ore_copper']).toBeUndefined()
    expect(codexIds(s, 'items').has('ore_copper')).toBe(true)
  })

  it('C3：配方在制作成功时登记、矿场在开采时登记、词缀在造装/重铸时登记', () => {
    const s = newGame('T', 0)
    s.materials['ore_copper'] = 10
    startCraft(s, 'smelt_copper', 1)
    simulate(s, 60_000, { mode: 'online', rng: mulberry32(2) })
    expect(codexIds(s, 'recipes').has('smelt_copper')).toBe(true)

    s.actions.current = { ref: { kind: 'mine', siteId: 'copper_seam' }, remaining: 1, startedAt: 0, durationMs: 0, procMisses: 0 }
    simulate(s, 120_000, { mode: 'online', rng: mulberry32(3) })
    expect(codexIds(s, 'ores').has('copper_seam')).toBe(true)

    const id = addInstance(s, 'pick_void') // 造装即登记词缀
    expect(s.equipment.find((e) => e.instanceId === id)!.affixes.length).toBeGreaterThan(0)
    expect(codexIds(s, 'affixes').size).toBeGreaterThan(0)

    // 重铸换词缀后同样登记
    s.gold = 1e6
    s.materials['essence'] = 50
    s.materials['emberstone'] = 50
    applyCommand(s, { type: 'reforge', instanceId: id, locks: [] }, 0, mulberry32(4))
    const seen = codexIds(s, 'affixes')
    for (const a of s.equipment.find((e) => e.instanceId === id)!.affixes) expect(seen.has(a.id)).toBe(true)
  })
})

describe('图鉴进度与里程碑（C4/C5）', () => {
  it('C5：条目总数 = 222，且与内容表推导一致（6 分区）', () => {
    const s = newGame('T', 0)
    const { total, categories } = codexProgress(s)
    const relicCount = Object.keys(CONTENT.items).filter((id) => itemDef(id).category === 'relic').length
    expect(total).toBe(
      Object.keys(CONTENT.items).length -
        relicCount +
        CONTENT.recipes.length +
        CONTENT.affixes.affixes.length +
        CONTENT.companions.companions.length +
        relicCount +
        CONTENT.ores.length,
    )
    expect(total).toBe(222)
    expect(categories.reduce((n, c) => n + c.total, 0)).toBe(total)
  })

  it('C4：里程碑达到即发奖，且幂等（重复调用不重发）', () => {
    const s = newGame('T', 0)
    // 直接塞满 25% 所需的物品登记（用内容表前 N 项）
    const ids = Object.keys(CONTENT.items).filter((id) => itemDef(id).category !== 'relic')
    const need = Math.ceil(222 * SEASON_DEF.codexMilestones[0].pct)
    for (const id of ids.slice(0, need)) recordItem(s, id)
    const ev1 = checkCodexMilestones(s)
    expect(ev1.some((e) => e.type === 'codexMilestone')).toBe(true)
    const goldAfter = s.gold
    const ev2 = checkCodexMilestones(s)
    expect(ev2.some((e) => e.type === 'codexMilestone')).toBe(false)
    expect(s.gold).toBe(goldAfter)
    expect(codexMilestonesClaimed(s).has(String(SEASON_DEF.codexMilestones[0].pct))).toBe(true)
  })

  it('C4b：100% 里程碑发徽记（图鉴与赛季解耦，不发赛季声望）', () => {
    const s = newGame('T', 0)
    // 全量登记（物品/配方/词缀/矿场）+ 伙伴 + 遗物
    for (const id of Object.keys(CONTENT.items)) {
      if (itemDef(id).category !== 'relic') recordItem(s, id)
      else s.materials[id] = 1
    }
    for (const r of CONTENT.recipes) recordRecipe(s, r.id)
    for (const a of CONTENT.affixes.affixes) recordAffix(s, a.id)
    for (const o of CONTENT.ores) recordOre(s, o.id)
    for (const c of CONTENT.companions.companions) s.companions[c.id] = { level: 1, xp: 0, trait: 'scholar' }

    const prog = codexProgress(s)
    expect(prog.pct).toBeCloseTo(1, 6)
    const events: GameEvent[] = checkCodexMilestones(s)
    expect(events.filter((e) => e.type === 'codexMilestone').length).toBe(SEASON_DEF.codexMilestones.length)
    expect(s.materials['expedition_token']).toBeGreaterThan(0)
    expect(s.season.renown).toBe(0) // 解耦：图鉴不给赛季声望
  })
})

describe('冷启动回溯（C6）', () => {
  it('C6：老档（无 codex）回溯登记持有物与装备词缀；配方/词缀历史不回溯', () => {
    const s = newGame('T', 0)
    s.codex = { items: '', recipes: '', affixes: '', ores: '' }
    addMaterial(s, 'ore_iron', 5)
    const id = addInstance(s, 'pick_mithril')
    // 模拟"老档"：清空登记但保留持有物
    s.codex = { items: '', recipes: '', affixes: '', ores: '' }
    checkCodexBackfill(s)
    expect(codexIds(s, 'items').has('ore_iron')).toBe(true)
    expect(codexIds(s, 'items').has('pick_mithril')).toBe(true)
    const inst = s.equipment.find((e) => e.instanceId === id)!
    for (const a of inst.affixes) expect(codexIds(s, 'affixes').has(a.id)).toBe(true)
    expect(codexIds(s, 'recipes').size).toBe(0) // 无法回溯
    expect(codexIds(s, 'ores').size).toBe(0) // 无法回溯
  })

  it('离线路径也会推进图鉴（结算后登记）', () => {
    const s = newGame('T', 0)
    s.materials['ore_copper'] = 10
    startCraft(s, 'smelt_copper', 3)
    s.meta.lastSeenAt = 0
    settleOffline(s, 60_000)
    expect(codexIds(s, 'recipes').has('smelt_copper')).toBe(true)
  })
})

describe('v2.3 测评处置回归', () => {
  it('B1：离线窗口采矿同样登记矿场（矿场分区不再对放置玩家残缺）', () => {
    const s = newGame('T', 0)
    s.actions.current = {
      ref: { kind: 'mine', siteId: 'copper_seam' },
      remaining: null,
      startedAt: 0,
      durationMs: 0,
      procMisses: 0,
    }
    s.meta.lastSeenAt = 0
    const summary = settleOffline(s, 60_000)
    expect(summary).not.toBeNull()
    expect(s.stats.totalMines).toBeGreaterThan(0)
    expect(codexIds(s, 'ores').has('copper_seam')).toBe(true)
  })

  it('M1：离线期间达成的赛季等级与图鉴里程碑进入摘要（不再静默到账）', () => {
    const s = newGame('T', 0)
    for (const k of ['mining', 'smelting', 'forging', 'enhancing'] as const) s.skills[k] = 1e12
    refreshSeason(s, CONTENT.season.epoch + 1000)
    checkSeason(s)
    // 让第一条任务直接达标（离线前已积累）
    const slot = s.season.tasks[0]
    const tpl = CONTENT.season.templates.find((t) => t.id === slot.defId)!
    ;(s.stats as unknown as Record<string, number>)[tpl.counter] = slot.base + tpl.targets[0]
    s.meta.lastSeenAt = 0
    const summary = settleOffline(s, 60_000)
    expect(summary).not.toBeNull()
    expect(summary!.seasonLevels.length).toBeGreaterThan(0)
  })

  it('M2：传承后赛季保持解锁（粘性），跨季照常结算', () => {
    const s = newGame('T', 0)
    for (const k of ['mining', 'smelting', 'forging', 'enhancing'] as const) s.skills[k] = 1e12
    refreshSeason(s, CONTENT.season.epoch + 1000)
    expect(s.meta.seasonUnlockedOnce).toBe(true)
    // 模拟传承：技能重置到低等级
    for (const k of ['mining', 'smelting', 'forging', 'enhancing'] as const) s.skills[k] = 100
    expect(seasonUnlocked(s)).toBe(true) // 粘性
    const idxBefore = s.season.index
    refreshSeason(s, CONTENT.season.epoch + 3 * CONTENT.season.days * 86400000 + 1000)
    expect(s.season.index).toBeGreaterThan(idxBefore) // 仍会轮换
  })

  it('M3：赛季抽取的组合在 24 季内充分展开（不再以模板数为周期硬循环）', () => {
    const combos = new Set<string>()
    for (let i = 0; i < 24; i++) combos.add(pickSeasonTasks(i).map((t) => t.defId).sort().join('+'))
    expect(combos.size).toBeGreaterThanOrEqual(12) // 原实现只有 5 种
  })
})
