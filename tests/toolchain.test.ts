import { readFileSync } from 'node:fs'
import { CONTENT } from '../src/game/content'
import { xpForLevel } from '../src/game/level'
import { prestigePointsFor } from '../src/game/prestige'
import { scaleTargets } from '../src/game/scale'
import { seasonTargetsFor } from '../src/game/season'
import { newGame } from '../src/game/state'
import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

describe('toolchain', () => {
  it('vitest 可运行', () => {
    expect(1 + 1).toBe(2)
  })

  /**
   * 内容管线不变量：data/*.json 必须与 scripts/gen-content.mjs **同源**。
   * 起因（v2.5 测评 Blocker B2）：开发期手改了 data/fx.json（删掉无来源的 cue、把默认档改成 auto），
   * 生成器没同步 → 任何人跑一次 `npm run gen` 都会把这些修正回滚，且 audit E6 与 F10 会立刻失败。
   * 用 --check（只比对不写盘）把它变成回归用例：以后手改 data/*.json 会在此被拦下。
   */
  it('data/*.json 与生成器同源（npm run gen:check）', () => {
    const out = execFileSync('node', ['scripts/gen-content.mjs', '--check'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    expect(out).toContain('--check 通过')
  }, 30000)

  /**
   * 内容可达性守卫（v3.0 / v3.2 收紧）：内容表里每一条内容都必须有产出路径。
   * v3.2 起 Major 级发现也一并拦截——此前 `X = (X ?? 0) + 1` 写法（T4 计数器）被静态规则误报，
   * 而测试只拦 Blocker，误报长期挂在审计输出里没人管；现在要求审计输出**零发现**。
   */
  it('内容可达性审计零发现（npm run audit:content，含 Major）', () => {
    const out = execFileSync('node', ['scripts/audit-content.mjs', '--json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const json = JSON.parse(out) as {
      findings: { sev: string; msg: string }[]
      unreachableItems: string[]
      neverIncremented: string[]
    }
    expect(json.findings, json.findings.map((f) => f.msg).join('; ')).toEqual([])
    expect(json.unreachableItems).toEqual([])
    expect(json.neverIncremented).toEqual([])
  }, 60000)

  /**
   * 证据链不变量：提交的 docs/audit-fx-output.json 必须**就是**审计脚本的输出
   * （测评 Minor-2：只比"JSON ↔ 内容表"不足以证明它是脚本产物）。
   */
  it('提交的证据 JSON == 本次 audit-fx 输出（npm run audit:fx:check）', () => {
    const out = execFileSync('node', ['scripts/audit-fx.mjs', '--check'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    expect(out).toContain('--check 通过')
    expect(out).toContain('审计结论：全部通过')
  }, 60000)
})

/**
 * 证据≠实现 门禁（v3.4 五审后新增）：提交的机器可读产物必须与**实现**一致。
 * 起因：v3.4 期间四次出现"宣称改了、代码里没有"（sim-audit 上限、cue 类型、D 段公式、经济入档）。
 * 这里选三处最容易被抄错的数字，直接由实现派生后与产物比对——产物陈旧或公式漂移即红。
 */
describe('证据与实现同源（防"宣称≠实现"）', () => {
  it('sim-audit-output.json 的满级点数 == prestigePointsFor(四技能满级)', () => {
    const sim = JSON.parse(readFileSync('docs/sim-audit-output.json', 'utf8')) as {
      d: { stretchScan: { rows: { name: string; points: number }[] } }
    }
    const s = newGame('T', 0)
    const xp100 = xpForLevel(100)
    s.skills = { mining: xp100, smelting: xp100, forging: xp100, enhancing: xp100 }
    const impl = prestigePointsFor(s)
    const row = sim.d.stretchScan.rows.find((r) => r.name.includes('满级'))
    expect(row, '产物应含满级行').toBeTruthy()
    expect(row!.points, '产物点数必须等于实现（漂移即失败）').toBe(impl)
  })

  it('season.json 的缩放系数 == 内核系数；缩放目标 == scaleTargets(基础, 系数)', () => {
    const s = newGame('T', 0)
    const coef = CONTENT.season.scaleByMaturity.junior
    const tpl = CONTENT.season.templates[0]
    expect(seasonTargetsFor(s, tpl.id)).toEqual(scaleTargets(tpl.targets, coef))
  })
})
