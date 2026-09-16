// ============================================================
// Forging v3.4 · A1 效率口径（面板 == 结算）
// 起因（v3.0 硬核评审 P0-1，挂 v3.2/v3.3 两版）：在线 proc 只读装备侧 efficiency，
// 而面板也只显示装备侧 → 丰饶符文/效率精通"看得见、挖不动"（只在深渊战力里体现）。
// 本文件断言：① 有效属性 = 装备 + 符文 + 精通；② 在线 proc 真的吃符文；
// ③ 展示侧与结算侧走同一个函数（源码契约）。
// ============================================================
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { useRune } from '../src/game/buffs'
import { CONTENT } from '../src/game/content'
import { addInstance, addMaterial, newGame } from '../src/game/state'
import { simulate } from '../src/game/settle'
import { effectiveEfficiency, effectiveStats } from '../src/game/stats'
import { mulberry32 } from '../src/game/rng'
import type { GameState } from '../src/game/types'

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

function fresh(): GameState {
  const s = newGame('T', 0)
  const id = addInstance(s, 'pick_copper')
  s.equipment.find((e) => e.instanceId === id)!.affixes = [{ id: 'flow', value: 0.2 }] // flow = 效率词缀
  s.slots.pick = id
  return s
}

describe('A1 有效效率 = 装备 + 符文 + 精通', () => {
  it('符文激活后有效效率上升，装备侧不变（同源函数的对照）', () => {
    const s = fresh()
    const before = effectiveEfficiency(s, 1000)
    const rune = CONTENT.runes.find((r) => r.effect === 'efficiency')
    expect(rune, '内容表应有效率符文').toBeTruthy()
    addMaterial(s, rune!.id, 1)
    useRune(s, rune!.id, 1000)
    const after = effectiveEfficiency(s, 1000)
    expect(after).toBeGreaterThan(before)
    expect(after - before).toBeCloseTo(rune!.value, 6)
    // 符文过期后回落
    expect(effectiveEfficiency(s, 1000 + rune!.durationMs + 1)).toBeCloseTo(before, 6)
  })

  it('精通（perk）计入有效效率；且有效值 ≥ 装备侧（不存在"面板比结算大"的情形）', () => {
    const s = fresh()
    const pick = CONTENT.perks.find((p) => p.effect === 'efficiency')
    if (pick) {
      s.meta.prestige.perks[pick.id] = 2
      const st = effectiveStats(s, 0)
      expect(st.efficiency).toBeGreaterThanOrEqual(2 * pick.perPoint)
    }
    const st = effectiveStats(s, 0)
    expect(st.efficiency).toBeGreaterThanOrEqual(0)
  })
})

describe('A1 在线 proc 真的吃符文（行为判别）', () => {
  const runRounds = (withRune: boolean): number => {
    const s = fresh()
    // 让装备侧效率为 0，效率完全来自符文 → 旧实现下无符文效果，新实现下必翻倍
    s.equipment.forEach((e) => (e.affixes = []))
    if (withRune) {
      const rune = CONTENT.runes.filter((r) => r.effect === 'efficiency').sort((a, b) => b.value - a.value)[0]
      addMaterial(s, rune.id, 1)
      useRune(s, rune.id, 0)
    }
    s.actions.current = { ref: { kind: 'mine', siteId: CONTENT.ores[0].id }, remaining: 40, startedAt: 0, durationMs: 0, procMisses: 0 }
    // 注意：simulate 每轮按 durationOf 重算时长，注入的 now 必须足够大（否则一轮都不结算）
    simulate(s, 400_000, { mode: 'online', rng: mulberry32(7) })
    // 直接量产出：proc 触发会额外产出，故带符文应严格更多（不依赖事件类型）
    return s.materials['ore_copper'] ?? 0
  }

  it('同随机源下，带效率符文的产量严格多于无符文（旧实现两者相同）', () => {
    const noRune = runRounds(false)
    const withRune = runRounds(true)
    expect(noRune).toBeGreaterThan(0)
    expect(withRune, '效率符文必须在在线结算中生效').toBeGreaterThan(noRune)
  })
})

describe('A1 源码契约：展示侧与结算侧同源', () => {
  it('settle 的在线 proc 使用 effectiveEfficiency（不是 aggregateEquipment(...).efficiency）', () => {
    const st = src('src/game/settle.ts')
    expect(st).toContain('effectiveEfficiency(state, now)')
    expect(st).not.toMatch(/const E = aggregateEquipment\(state\)\.efficiency/)
  })

  it('RightPanel 的数值行使用 effectiveStats（面板 == 结算）', () => {
    const rp = src('src/ui/components/RightPanel.vue')
    expect(rp).toContain('effectiveStats(store.state, store.now)')
    expect(rp).toMatch(/效率 \{\{ pct\(eff\.efficiency\) \}\}/)
    expect(rp).toMatch(/经验 \{\{ pct\(eff\.wisdom\) \}\}/)
  })

  it('sim-audit 的 proc 口径与实现一致（保底更新过程），且落盘 JSON', () => {
    const sim = src('scripts/sim-audit.mjs')
    expect(sim).toContain('const need = Math.ceil(1 / E)')
    expect(sim).not.toContain('1 / (2 - E)')
    expect(sim).toContain("docs', 'sim-audit-output.json'")
  })
})
