// ============================================================
// v3.6：界面显示与移动端交互契约
// 起因（实机审计 + 自动脚本）：--c-accent-2 在卡片背景上仅 4.34:1、--c-danger 4.30:1
// （低于 WCAG AA 正文 4.5），touch-action 全仓缺失，设置页控件触摸目标偏小（滑杆 16px 等）。
// 本文件把修复后的值锁住：改回旧值 → 必红（探针验证过）。
// ============================================================
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (p: string): string => readFileSync(join(process.cwd(), ...p.split('/')), 'utf8')
const theme = read('src/ui/styles/theme.css')

function token(name: string): string {
  const m = theme.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))
  if (!m) throw new Error(`theme.css 缺少 token --${name}`)
  return m[1]
}
const lum = (hex: string): number => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const f = (v: number): number => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
const ratio = (a: string, b: string): number => {
  const [l1, l2] = [lum(a), lum(b)]
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
}

describe('v3.6 UI 契约：对比度 / 触屏 / 字号 / 触摸目标', () => {
  it('前景 token 在最亮卡片背景（--c-panel-2）上对比度 ≥4.5（WCAG AA 正文）', () => {
    const bg = token('c-panel-2')
    for (const name of ['c-text', 'c-text-dim', 'c-accent', 'c-accent-2', 'c-success', 'c-danger']) {
      const r = ratio(token(name), bg)
      expect(r, `--${name} on --c-panel-2 = ${r.toFixed(2)}（应 ≥4.5）`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('touch-action: manipulation 全局生效（触屏双击缩放误触防护）', () => {
    expect(theme).toMatch(/touch-action:\s*manipulation/)
  })

  it('阅读型字号 token：默认 11px、窄屏（≤900px）提到 12px', () => {
    expect(theme, '默认值').toMatch(/--fs-note:\s*11px/)
    expect(theme, '窄屏覆盖').toMatch(/@media \(max-width: 900px\)[\s\S]{0,140}--fs-note:\s*12px/)
  })

  it('设置页窄屏控件触摸目标规则存在（F3 源码契约）', () => {
    const s = read('src/ui/components/SettingsPanel.vue')
    expect(s, '应有窄屏媒体查询').toMatch(/@media \(max-width: 900px\)/)
    expect(s, '.opt-row 最小高度').toMatch(/\.opt-row\s*\{[^}]*min-height:\s*40px/)
    expect(s, '.slider 命中区').toMatch(/\.slider\s*\{[^}]*height:\s*36px/)
    expect(s, '.select 最小高度').toMatch(/\.select\s*\{[^}]*min-height:\s*40px/)
    expect(s, '.text-input 最小高度').toMatch(/\.text-input\s*\{[^}]*min-height:\s*40px/)
  })

  it('阅读型小字已改用 --fs-note token（防回退成硬编码 11px）', () => {
    for (const f of ['ActionGrid.vue', 'ItemDetailModal.vue', 'TasksPanel.vue', 'ExpeditionPanel.vue', 'RightPanel.vue']) {
      const s = read(`src/ui/components/${f}`)
      expect(s, `${f} 应使用 var(--fs-note)`).toContain('var(--fs-note)')
    }
    const rp = read('src/ui/components/RightPanel.vue')
    expect(rp, '.slot-label 不应回退 11px').not.toMatch(/\.slot-label\s*\{[^}]*font-size:\s*11px/)
    expect(rp, '.price 不应回退 11px').not.toMatch(/\.price\s*\{[^}]*font-size:\s*11px/)
    const idm = read('src/ui/components/ItemDetailModal.vue')
    expect(idm, '.small 不应回退 11px').not.toMatch(/\.small\s*\{[^}]*font-size:\s*11px/)
    expect(idm, '.adesc 不应回退 11px').not.toMatch(/\.adesc\s*\{[^}]*font-size:\s*11px/)
  })
})
