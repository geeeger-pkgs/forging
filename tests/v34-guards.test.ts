// ============================================================
// v3.4 复审守卫：**"宣称≠实现"专用检查**
// 起因（复审抓出两条虚假交付）：上一次提交的信息宣称
//   ① sim-audit 的满配上限已补里程碑  ② fx-map 的 cue 已收窄为闭合联合
// 但两者都只写了"声明/注释"，代码里并没有生效（CueId 声明后零引用；sim-audit 无 milestoneSpeed）。
// 这类失败不会再被功能测试发现（功能照常跑），所以单独立一组**契约断言**把它们钉死。
// ============================================================
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('复审守卫：宣称的改动必须真的在代码里', () => {
  it('fx-map 的 FxPlan.cue 是闭合联合 CueId（不是 string），且 CueId 被真正引用', () => {
    const m = src('src/ui/fx-map.ts')
    expect(m, 'cue 必须收窄为 CueId').toContain('cue?: CueId')
    expect(m, '不得残留 cue?: string').not.toContain('cue?: string')
    // CueId 必须至少被引用一次（此前出现过"声明了但零引用"的假交付）
    expect((m.match(/CueId/g) ?? []).length).toBeGreaterThanOrEqual(2)
  })

  it('sim-audit 的满配速度上限含 Lv76~100 里程碑（milestoneSpeed 必须参与计算）', () => {
    const s = src('scripts/sim-audit.mjs')
    expect(s).toContain('milestoneSpeed')
    expect(s, 'speedMaxAll 必须把 milestoneSpeed 计入').toMatch(/speedMaxAll = [^\n]*milestoneSpeed/)
  })
})
