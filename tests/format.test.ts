// ============================================================
// Forging v3.2 · 显示格式化与 UI 卫生（DoD §3）
// ============================================================
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fmtDur, fmtHours, fmtPct } from '../src/ui/format'
import { achievementValue } from '../src/game/achievements'
import { CONTENT } from '../src/game/content'
import { addInstance, newGame } from '../src/game/state'

describe('fmtDur 边界（DoD：59s / 60s / 60m / 1h）', () => {
  it('秒级：<10s 一位小数，10~59s 取整；59.9s 不得输出 "60s"（进位）', () => {
    expect(fmtDur(0)).toBe('0s')
    expect(fmtDur(-5)).toBe('0s')
    expect(fmtDur(999)).toBe('1.0s')
    expect(fmtDur(5_400)).toBe('5.4s')
    expect(fmtDur(59_000)).toBe('59s')
    expect(fmtDur(59_900)).toBe('1m 0s') // 关键边界：取整进位到分钟，而不是 "60s"
  })

  it('分钟级：60s → "1m 0s"，3599s → "59m 59s"，3600s → "1h 0m"', () => {
    expect(fmtDur(60_000)).toBe('1m 0s')
    expect(fmtDur(273_000)).toBe('4m 33s') // 文档示例（深渊倒计时）
    expect(fmtDur(3_599_000)).toBe('59m 59s')
    expect(fmtDur(3_600_000)).toBe('1h 0m')
    expect(fmtDur(5_400_000)).toBe('1h 30m')
  })

  it('天级：≥48h 起用 "Xd Yh"（评审 N3：赛季倒计时曾显示 "336h 0m"，可读性倒退）', () => {
    expect(fmtDur(47 * 3_600_000 + 59 * 60_000)).toBe('47h 59m')
    expect(fmtDur(48 * 3_600_000)).toBe('2d 0h')
    expect(fmtDur(14 * 24 * 3_600_000)).toBe('14d 0h') // 赛季周期 14 天
  })

  it('非有限值兜底（不产生 NaN 文案）', () => {
    expect(fmtDur(Number.NaN)).toBe('0s')
    expect(fmtDur(Number.POSITIVE_INFINITY)).toBe('0s')
  })

  it('fmtHours：内容表的小时档位写法统一为 "Nh"', () => {
    expect(fmtHours(1)).toBe('1h')
    expect(fmtHours(8)).toBe('8h')
    for (const h of CONTENT.expeditions.hours) expect(fmtHours(h)).toMatch(/^\d+h$/)
  })

  it('fmtPct：一律一位小数；非有限值显示破折号', () => {
    expect(fmtPct(0)).toBe('0.0%')
    expect(fmtPct(0.7412)).toBe('74.1%')
    expect(fmtPct(1)).toBe('100.0%')
    expect(fmtPct(Number.NaN)).toBe('—')
  })
})

describe('成就进度值（B6 排序依据）', () => {
  it('stat/slotsFilled/skillLevel 三类都有可读进度', () => {
    const s = newGame('T', 0)
    s.stats.totalMines = 7
    const statDef = CONTENT.achievements.find((a) => a.type === 'stat' && a.stat === 'totalMines')
    if (statDef) expect(achievementValue(s, statDef)).toBe(Math.min(7, statDef.target))
    const slotsDef = CONTENT.achievements.find((a) => a.type === 'slotsFilled')
    if (slotsDef) {
      expect(achievementValue(s, slotsDef)).toBe(0)
      const id = addInstance(s, 'pick_copper')
      s.slots.pick = id
      expect(achievementValue(s, slotsDef)).toBe(1)
    }
    const skillDef = CONTENT.achievements.find((a) => a.type === 'skillLevel')
    if (skillDef) expect(achievementValue(s, skillDef)).toBeGreaterThanOrEqual(1)
  })
})

describe('窄屏默认状态（DoD §3：抽屉/右栏默认收起）', () => {
  // 回归护栏：v3.2 实机验收曾抓到 toolsOpen 初始值写反（窄屏默认展开、吃掉首屏），
  // node 环境无法渲染组件，故对源码做契约断言；行为侧由实机烟测（iframe 375/390px）覆盖。
  const comp = (name: string) => readFileSync(join(process.cwd(), 'src', 'ui', 'components', name), 'utf8')
  const nav = comp('NavBar.vue')
  const right = comp('RightPanel.vue')

  it('NavBar：工具抽屉默认收起（技能页），初始即工具页时才展开，选中工具后自动收起', () => {
    // 初始值由"当前视图是否工具分区"决定（曾写反成 !includes → 技能页默认为 true，窄屏首屏被占满）
    expect(nav).toContain('const toolsOpen = ref(currentToolLabel.value !== null)')
    expect(nav).not.toContain('ref(!TOOL_VIEWS.includes(store.ui.view))')
    // 删除"进入工具页自动展开"的 watch（它与"选完收起"打架：watch 后跑又把抽屉顶开）
    expect(nav).not.toMatch(/watch\(\s*\(\) => store\.ui\.view/)
    expect(nav).toMatch(/function pickTool\([\s\S]{0,120}?toolsOpen\.value = false/)
  })

  it('NavBar：抽屉开关带 aria-expanded/aria-controls，面板挂 id 与 collapsed 类', () => {
    expect(nav).toContain(':aria-expanded="toolsOpen"')
    expect(nav).toContain('aria-controls="nav-tools"')
    expect(nav).toContain('id="nav-tools"')
    expect(nav).toContain(':class="{ collapsed: !toolsOpen }"')
    // 收起态样式必须只作用于窄屏媒体查询内（桌面端始终全展示）
    const mq = nav.slice(nav.indexOf('@media (max-width: 900px)'))
    expect(mq).toContain('.tools.collapsed')
  })

  it('RightPanel：窄屏右栏默认收起、默认分区为装备，Tab 具备 aria 状态', () => {
    expect(right).toContain("const rightTab = ref<RightTab>('gear')")
    expect(right).toContain('const rightOpen = ref(false)')
    expect(right).toContain('role="tablist"')
    expect(right).toContain(':aria-selected="rightOpen && rightTab === t.id"')
  })
})

describe('UI 卫生（DoD：日常操作不得用系统弹窗）', () => {
  const uiDir = join(process.cwd(), 'src', 'ui')
  const files: string[] = []
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.name.endsWith('.vue') || e.name.endsWith('.ts')) files.push(p)
    }
  }
  walk(uiDir)

  it('src/ui 下不再有 window.prompt（日常操作零系统输入框）', () => {
    const hits = files.filter((f) => /window\.prompt\(/.test(readFileSync(f, 'utf8')))
    expect(hits.map((f) => f.replace(process.cwd(), ''))).toEqual([])
  })

  it('window.confirm 只允许出现在"破坏性操作"（传承 / 存档 / 整理与批量回收）', () => {
    const allowed = ['PrestigePanel.vue', 'SettingsPanel.vue', 'RightPanel.vue']
    const hits = files.filter((f) => readFileSync(f, 'utf8').includes('window.confirm('))
    for (const f of hits) {
      expect(allowed.some((a) => f.endsWith(a)), `${f} 不应使用 confirm`).toBe(true)
    }
    const rp = readFileSync(join(uiDir, 'components', 'RightPanel.vue'), 'utf8')
    expect((rp.match(/window\.confirm\(/g) ?? []).length).toBeLessThanOrEqual(2)
  })

  it('主题里存在键盘焦点环规则（focus-visible）', () => {
    const css = readFileSync(join(uiDir, 'styles', 'theme.css'), 'utf8')
    expect(css).toContain(':focus-visible')
    expect(css).toContain('outline: 2px solid var(--c-accent)')
  })
})
