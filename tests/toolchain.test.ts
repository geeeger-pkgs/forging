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
   * 内容可达性守卫（v3.0）：内容表里每一条内容都必须有产出路径。
   * 脚本本身只做静态判定；这里断言"无 Blocker 级发现"，防止新增内容时漏接产出路径。
   */
  it('内容可达性审计无 Blocker（npm run audit:content）', () => {
    const out = execFileSync('node', ['scripts/audit-content.mjs', '--json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const json = JSON.parse(out) as { findings: { sev: string; msg: string }[]; unreachableItems: string[] }
    const blockers = json.findings.filter((f) => f.sev === 'Blocker')
    expect(blockers, blockers.map((f) => f.msg).join('; ')).toEqual([])
    expect(json.unreachableItems).toEqual([])
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
