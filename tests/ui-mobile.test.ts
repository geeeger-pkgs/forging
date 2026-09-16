// ============================================================
// v3.6.1：移动端交互契约（评审实测处置）
// 起因（双人评审 + 实机复现）：
//   · 窄屏导航随内容滚走（成就页 8229px 处 nav top=-8132px，完全不可达）
//   · .body 内层滚动容器溢出 75px（select 固有宽度撑破）——旧审计口径只查 documentElement 漏报
//   · .tab 27px / .search 29px / .sel 23px / .num-input 22px / .slot-item 20px 不在 .btn 兜底内
//   · iOS 对 <16px 的输入控件聚焦会强制放大页面
//   · .tab.active 白字压蓝底 3.24（本轮提亮 accent-2 后恶化）
// 本文件把修复锁住：改回去 → 必红（探针验证过）。
// 断言纪律（评审 A-m3/m4）：先剥注释，规则必须真的在媒体查询块内（防"写进注释/移出媒体查询"骗过）。
// ============================================================
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (p: string): string => readFileSync(join(process.cwd(), ...p.split('/')), 'utf8')
/** 剥 CSS 注释（评审 A-m3：`/* touch-action: manipulation *\/` 不应满足断言） */
const stripComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '')

/** 取 `@media (max-width: 900px)` 块体（配平花括号；评审 A-m4：规则必须在媒体查询内才算数） */
function mediaBlock(css: string): string {
  const clean = stripComments(css)
  const start = clean.indexOf('@media (max-width: 900px)')
  if (start < 0) return ''
  let depth = 0
  let out = ''
  for (let i = start; i < clean.length; i++) {
    const c = clean[i]
    if (c === '{') {
      depth++
      if (depth === 1) continue
    }
    if (c === '}') {
      depth--
      if (depth === 0) break
    }
    if (depth >= 1) out += c
  }
  return out
}

describe('v3.6.1 移动端契约：导航可达 / 触摸兜底 / 输入字号 / 对比度修正', () => {
  it('窄屏导航 sticky（滚动后仍可达）且在媒体查询块内', () => {
    const nav = read('src/ui/components/NavBar.vue')
    const block = mediaBlock(nav)
    expect(block, 'NavBar 应有窄屏媒体查询').toBeTruthy()
    expect(block, '.nav 应 sticky').toMatch(/\.nav\s*\{[^}]*position:\s*sticky/)
    expect(block, '.nav 应 top:0').toMatch(/\.nav\s*\{[^}]*top:\s*0/)
  })

  it('触摸目标统一兜底：主题层窄屏给自定义控件 min-height 40px（在媒体查询内）', () => {
    // ⚠️ 必须先剥注释再找块：注释里也写了 .slot-item（本测试首版就被自己的注释骗过——A-m3 同类）
    const theme = stripComments(read('src/ui/styles/theme.css'))
    const blocks = theme.split('@media (max-width: 900px)').slice(1)
    const block = blocks.find((b) => b.includes('.slot-item'))
    expect(block, '应存在含 .slot-item 的窄屏兜底块').toBeTruthy()
    for (const cls of ['.tab', '.search', '.sel', '.num', '.num-input', '.slot-item', '.slider', '.select', '.text-input']) {
      expect(block!, `${cls} 应有 40px 兜底`).toContain(cls)
    }
    expect(block!, 'min-height: 40px').toMatch(/min-height:\s*40px/)
  })

  it('窄屏输入类控件字号 ≥16px：组件 scoped 块内逐个生效（防 iOS 聚焦放大）', () => {
    // 评审 B-M4 实机实测：theme.css 的全局兜底会被 scoped 的 13px 按特异性压过 → 必须写在组件内
    const cases: [string, RegExp][] = [
      ['src/ui/components/MainPanel.vue', /\.search[\s\S]{0,220}font-size:\s*16px/],
      ['src/ui/components/ItemDetailModal.vue', /\.sel\s*\{[^}]*font-size:\s*16px/],
      ['src/ui/components/SettingsPanel.vue', /\.select,\s*\.text-input\s*\{[^}]*font-size:\s*16px/],
      ['src/ui/components/ActionDialog.vue', /\.num\s*\{[^}]*font-size:\s*16px/],
      ['src/ui/components/RightPanel.vue', /\.num-input\s*\{[^}]*font-size:\s*16px/],
    ]
    for (const [f, re] of cases) {
      expect(stripComments(read(f)), `${f} 窄屏输入应 ≥16px`).toMatch(re)
    }
    // theme.css 全局兜底保留（覆盖未来新增、无 scoped 声明的输入）
    expect(stripComments(read('src/ui/styles/theme.css')), '全局兜底').toMatch(/font-size:\s*16px/)
  })

  it('.tab.active 不再用白字压蓝底（评审 A-M1：3.24 → 深色文字 5.45）', () => {
    const mp = read('src/ui/components/MainPanel.vue')
    expect(mp, '.tab.active 不应是 #fff').not.toMatch(/\.tab\.active\s*\{[^}]*color:\s*#fff/i)
    expect(mp, '.tab.active 应用深色文字').toMatch(/\.tab\.active\s*\{[^}]*color:\s*#131829/)
  })

  it('设置页 select 允许收缩（评审 B-M6：固有宽度曾撑破容器 75px）', () => {
    const sp = read('src/ui/components/SettingsPanel.vue')
    const block = mediaBlock(sp)
    expect(block, '.select 应 min-width:0').toMatch(/\.select\s*\{[^}]*min-width:\s*0/)
    expect(block, '.select 应可伸缩').toMatch(/\.select\s*\{[^}]*flex:\s*1/)
  })

  it('内层滚动容器：overscroll-behavior 与 safe-area 内边距共存', () => {
    const app = read('src/App.vue')
    const block = mediaBlock(app)
    expect(block, 'overscroll-behavior-y: contain').toMatch(/overscroll-behavior-y:\s*contain/)
    expect(block, 'safe-area 内边距保留').toMatch(/padding-bottom:\s*calc\(60px \+ env\(safe-area-inset-bottom/)
  })

  it('README 级契约：教程卡折叠开关存在（窄屏 sticky 下省 ~94px 实测）', () => {
    const nav = read('src/ui/components/NavBar.vue')
    expect(nav, '折叠状态 ref').toContain('tutOpen')
    expect(nav, '折叠开关按钮').toMatch(/class="t-title"[\s\S]{0,220}@click="tutOpen = !tutOpen"/)
    expect(nav, 'aria-expanded').toMatch(/aria-expanded="tutOpen"/)
    expect(nav, '折叠时隐藏内容').toMatch(/\.tutorial\.folded\s+\.t-goal/)
  })

  it('TopBar 里程碑窄屏字号用 token（评审 A-m1：曾窄屏比桌面还小）', () => {
    // 注意：该规则在 640px 块里（不是 900px）——按剥注释全文匹配，不限定块
    const tb = stripComments(read('src/ui/components/TopBar.vue'))
    expect(tb, '.ms 应用 --fs-note').toMatch(/\.ms\s*\{[^}]*font-size:\s*var\(--fs-note\)/)
    expect(tb, '.ms 不应硬编码 11px').not.toMatch(/\.ms\s*\{[^}]*font-size:\s*11px/)
  })
})
