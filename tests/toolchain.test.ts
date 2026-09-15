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
})
