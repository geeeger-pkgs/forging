// ============================================================
// Forging v3.2 评审处置回归（docs/review-v3.2.md）
// 背景：v3.2 发布后由两名资深玩家独立评审，抓出 1 Blocker + 若干 Major/Minor。
// 本文件把每一条"修好了"变成可复查的断言：
//   · 内核行为测试（D2 注入时钟、卸下命令链路）
//   · 源码契约（UI 可达性、样式选择器、格式化唯一入口、默认态、触控尺寸）
// 说明：项目测试环境是 node（无 DOM、无 @vue/test-utils），组件渲染类的回归
// 由"源码契约 + 实机烟测"共同覆盖——因此断言写成对文件内容的精确约束。
// ============================================================
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { applyCommand } from '../src/game/commands'
import { mulberry32 } from '../src/game/rng'
import { simulate } from '../src/game/settle'
import { addInstance, instanceById, newGame } from '../src/game/state'
import { fmtDur } from '../src/ui/format'
import type { GameState } from '../src/game/types'

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const ui = (name: string) => src(`src/ui/components/${name}`)

// ---------------- Blocker：卸下入口可达 ----------------

describe('Blocker 处置：卸下入口重新可达', () => {
  it('内核链路：装备后可卸下，槽位清空且装备留在行囊', () => {
    const s = newGame('T', 0)
    const id = addInstance(s, 'pick_copper')
    applyCommand(s, { type: 'equip', instanceId: id }, 0)
    expect(s.slots.pick).toBe(id)
    applyCommand(s, { type: 'unequip', slot: 'pick' }, 0)
    expect(s.slots.pick ?? null).toBeNull()
    expect(instanceById(s, id), '卸下不应销毁装备').not.toBeNull()
  })

  it('UI 契约：卸下按钮在装备详情弹窗内（条件只依赖"是否已装备"）', () => {
    const modal = ui('ItemDetailModal.vue')
    expect(modal).toContain('const equippedSlot')
    expect(modal).toContain('function unequip()')
    expect(modal).toMatch(/v-if="equippedSlot"[^>]*@click="unequip"/)
  })

  it('UI 契约：右栏不再保留"材料详情区卸下"这个永不渲染的死按钮', () => {
    const rp = ui('RightPanel.vue')
    expect(rp).not.toMatch(/@click="unequip\(/)
  })
})

// ---------------- Major：B3 高亮选择器 ----------------

describe('Major 处置：B3 视图相关数值高亮', () => {
  it('样式选择器与模板类名一致（stats-line，而非 stat-line）', () => {
    const rp = ui('RightPanel.vue')
    expect(rp).toContain('.stats-line .hot')
    expect(rp).toContain('class="stats-line"')
    // 剥掉注释再断言：说明性注释里允许提到旧写法
    const code = rp
      .split(/\r?\n/)
      .filter((l) => !l.trim().startsWith('/*') && !l.trim().startsWith('*') && !l.trim().startsWith('<!--'))
      .join('\n')
    expect(code).not.toContain('.stat-line .hot')
  })

  it('数值行字号已提到 12px（可读性）', () => {
    const rp = ui('RightPanel.vue')
    const block = rp.slice(rp.indexOf('.stats-line {'), rp.indexOf('.stats-line {') + 160)
    expect(block).toContain('font-size: 12px')
  })
})

// ---------------- Major：B4 格式化唯一入口 ----------------

describe('Major 处置：B4 时长/百分比只有一个实现', () => {
  it('icons.ts 不再自带实现，改为转出口 format.ts', () => {
    const icons = src('src/ui/icons.ts')
    expect(icons).toContain("export { fmtDur as fmtDuration, fmtPct } from './format'")
    expect(icons).not.toMatch(/export function fmt(Duration|Pct)/)
  })

  it('除 format.ts 外，src/ui 不再出现"非一位小数"的百分比写法', () => {
    // 评审（复审 N3）：原先按函数名白名单扫描，`pct()`/`qualityPct` 这类"没起 fmt 名"的实现全部漏检（实际漏了 4 处）。
    // 改为**形态匹配**：任何 `* 100).toFixed(0)`（零位小数）或 `Math.round(<x> * 100)`（取整百分比）都判失败；
    // `Math.round(x * 100) / 100` 是"两位小数取整"工具（AbyssPanel.fmtW 的权重显示），允许。
    const walk = (dir: string): string[] => {
      const out: string[] = []
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name)
        if (e.isDirectory()) out.push(...walk(p))
        else if (e.name.endsWith('.vue') || e.name.endsWith('.ts')) out.push(p)
      }
      return out
    }
    const offenders: string[] = []
    for (const f of walk(join(process.cwd(), 'src', 'ui'))) {
      if (f.endsWith('format.ts')) continue
      const s = readFileSync(f, 'utf8')
      for (const m of s.matchAll(/\*\s*100\)\.toFixed\(0\)/g)) offenders.push(`${f} → ${m[0]}`)
      for (const m of s.matchAll(/Math\.round\([^)]*\*\s*100\)(?!\s*\/\s*100)/g)) offenders.push(`${f} → ${m[0]}`)
    }
    expect(offenders.map((x) => x.replace(process.cwd(), ''))).toEqual([])
  })

  it('高流量界面（动作弹窗）已改用统一格式', () => {
    const ad = ui('ActionDialog.vue')
    expect(ad).toContain("import { fmtDur, fmtPct } from '../format'")
    expect(ad).not.toMatch(/toFixed\(0\)\}\}%/) // 强化率不再 0 位小数
  })
})

// ---------------- Major：D2 注入时钟 ----------------

describe('Major 处置：D2 强化路径不再读墙钟', () => {
  const attempt = (seed: number, nowOffsetMs: number): number => {
    const s: GameState = newGame('T', 0)
    s.materials['ingot_copper'] = 100
    s.materials['essence'] = 100
    const id = addInstance(s, 'pick_copper')
    s.equipment.find((e) => e.instanceId === id)!.affixes = []
    const inst = instanceById(s, id)!
    inst.enhanceLevel = 1 // 第 2 级基础成功率 0.9（+符文 0.08 = 0.98，留出可判别区间）
    const wall = Date.now()
    s.buffs = [{ defId: 'rune_enhance_3', until: wall + 60_000 }] // 墙钟口径：生效中
    s.actions.current = {
      ref: { kind: 'enhance', instanceId: id, targetLevel: 2 },
      remaining: 1,
      startedAt: 0,
      durationMs: 0,
      procMisses: 0,
    }
    simulate(s, wall + nowOffsetMs, { mode: 'online', rng: mulberry32(seed) })
    s.actions.current = null
    return instanceById(s, id)!.enhanceLevel
  }

  it('同一随机源下，"注入时钟显示符文生效 / 已过期"必须给出不同结果（旧实现读墙钟 → 两者恒同）', () => {
    let discriminatingSeed = 0
    for (let seed = 1; seed <= 300 && discriminatingSeed === 0; seed++) {
      if (attempt(seed, 1_000) !== attempt(seed, 120_000)) discriminatingSeed = seed
    }
    expect(
      discriminatingSeed,
      '没有任何种子能让两种注入时钟产生差异 —— 强化成功率很可能又读了墙钟（D2 回归）',
    ).toBeGreaterThan(0)
  })

  it('源码契约：settle.ts 无 Date.now()，且 performEnhance 接收 now', () => {
    const st = src('src/game/settle.ts')
    // 注释里提到 Date.now() 不算违规（剥掉注释行再断言）
    const code = st
      .split(/\r?\n/)
      .filter((l) => !l.trim().startsWith('//'))
      .join('\n')
    expect(code).not.toMatch(/Date\.now\(\)/)
    expect(st).toMatch(/function performEnhance\([\s\S]{0,220}?now: number,/)
  })
})

// ---------------- Major：A2 底栏常驻 + 触控尺寸 ----------------

describe('Major 处置：窄屏可达性', () => {
  it('右栏 Tab 条在窄屏是 fixed 常驻视口底部（sticky 会因包含块在页面末尾而"不滚到底就看不见"）', () => {
    const rp = ui('RightPanel.vue')
    // v3.7.6：桌面新增了 sticky 吸顶 Tab 条（在右栏自身滚动容器内有效）→
    // 断言必须限定在**窄屏块内**（此前 slice 到文件尾，会把桌面规则误判为窄屏规则）
    // RightPanel 有多个 900px 块 → 逐个配平提取，取**含 .rtabs 的那个**
    const blocks: string[] = []
    let idx = rp.indexOf('@media (max-width: 900px)')
    while (idx !== -1) {
      let depth = 0
      let end = rp.length
      for (let i = rp.indexOf('{', idx); i < rp.length; i++) {
        if (rp[i] === '{') depth++
        else if (rp[i] === '}') {
          depth--
          if (depth === 0) {
            end = i
            break
          }
        }
      }
      blocks.push(rp.slice(idx, end))
      idx = rp.indexOf('@media (max-width: 900px)', end)
    }
    const mq = blocks.find((b) => b.includes('.rtabs'))
    expect(mq, '应有含 .rtabs 的窄屏块').toBeTruthy()
    expect(mq!).toContain('position: fixed')
    expect(mq!).toContain('bottom: 0')
    expect(mq!).not.toContain('position: sticky')
  })

  it('主滚动容器为常驻底栏留出内边距（否则遮住最后一行）', () => {
    expect(src('src/App.vue')).toMatch(/padding-bottom: calc\(60px \+ env\(safe-area-inset-bottom/)
  })

  it('窄屏触控目标 ≥40px', () => {
    const css = src('src/ui/styles/theme.css')
    const mq = css.slice(css.indexOf('窄屏触控目标'))
    expect(mq).toMatch(/\.btn,\s*\.btn\.sm\s*\{\s*min-height: 40px/)
    expect(ui('NavBar.vue')).toMatch(/min-height: 40px/)
    expect(ui('RightPanel.vue')).toMatch(/\.rtab \{\s*min-height: 40px/)
  })

  it('Tab 具 role=tab + aria-controls，分区具 role=tabpanel', () => {
    const rp = ui('RightPanel.vue')
    expect(rp).toContain(':aria-controls="`rtabpanel-${t.id}`"')
    expect(rp).toContain('role="tabpanel"')
    expect((rp.match(/role="tabpanel"/g) ?? []).length).toBe(3)
  })
})

// ---------------- Minor：交互收口 ----------------

describe('Minor 处置：交互收口', () => {
  it('材料菜单渲染在**被点的那一行**内（不再是列表末尾的单例）', () => {
    const rp = ui('RightPanel.vue')
    const loop = rp.slice(rp.indexOf('v-for="m in materials"'), rp.indexOf('data-sec="bag"'))
    expect(loop).toContain('v-if="openMenu === m.id"')
    expect(rp).not.toContain('materialById(openMenu)')
  })

  it('保留量草稿：非法输入不提交（空输入曾等于 0 → 静默关掉自动回收）', () => {
    const rp = ui('RightPanel.vue')
    expect(rp).toContain('const keepValid = computed(')
    expect(rp).toMatch(/function applyKeep\(\): void \{\s*\n\s*const id = openMenu\.value\s*\n\s*if \(!id \|\| !keepValid\.value\) return/)
    expect(rp).toContain('function clearKeep(')
    expect(rp).toContain("@keyup.enter=\"applyKeep\"")
  })

  it('打开/收起菜单时清空草稿（避免上一个材料的保留量被应用到这一个）', () => {
    const rp = ui('RightPanel.vue')
    expect(rp).toMatch(/function toggleMenu\(id: string\): void \{\s*\n\s*keepDraft\.value = null/)
  })

  it('配装命名可取消（按钮 + Esc）', () => {
    const rp = ui('RightPanel.vue')
    expect(rp).toContain('function cancelGearName()')
    expect(rp).toContain('@keyup.esc="cancelGearName"')
  })

  it('选中工具后抽屉自动收起', () => {
    const nav = ui('NavBar.vue')
    expect(nav).toMatch(/function pickTool\(v: string\): void \{\s*\n\s*setView\(v as never\)\s*\n\s*toolsOpen\.value = false/)
    expect(nav).not.toMatch(/@click="setView\('(prestige|tasks|expedition|codex|abyss|shop|achievements|settings)'\)"/)
  })

  it('成就未完成项一律显示 当前/目标（0/N 也要显示，无死分支）', () => {
    const ap = ui('AchievementsPanel.vue')
    expect(ap).toContain('<div v-if="!a.done" class="prog">')
    expect(ap).not.toContain('a.cur > 0')
  })

  it('空态文案给出下一步（C3）：顶栏 / 商店 / 远征', () => {
    expect(ui('TopBar.vue')).toContain('下一步：在下方点一个矿脉或配方开始')
    expect(ui('ShopPanel.vue')).toContain('下一步：回矿场挖矿')
    expect(ui('ExpeditionPanel.vue')).toContain('下一步：在下方选一条路线并派出队伍')
  })

  it('深渊折叠说明与实际规则一致（不再写"合计以总战力为准"这种含糊话）', () => {
    const ab = ui('AbyssPanel.vue')
    expect(ab).toContain('只留贡献最高 2 项与最弱 1 项')
  })

  it('槽位是可点入口：有 role/tabindex/Enter+Space 与"正在查看"高亮', () => {
    const rp = ui('RightPanel.vue')
    expect(rp).toContain('@keyup.enter="inspect(s.inst.instanceId)"')
    expect(rp).toContain('@keydown.space.prevent="inspect(s.inst.instanceId)"')
    expect(rp).toContain(':class="{ inspecting: inspectedSlot === s.id }"')
  })

  // ---- 复审（第二轮）新增：两名评审共同要求的放行条件 + 复审新发现问题 ----

  it('N1 底栏点开后必须把玩家带到面板（scrollIntoView，仅窄屏）', () => {
    const rp = ui('RightPanel.vue')
    expect(rp).toMatch(/async function toggleRightTab\(/)
    expect(rp).toContain('scrollIntoView(')
    expect(rp).toContain("window.matchMedia('(max-width: 900px)').matches")
    expect(rp).toContain('await nextTick()')
  })

  it('N2 卸下有反馈：命令返回 notice（此前返回空事件，弹窗里按钮静默消失）', () => {
    const s = newGame('T', 0)
    const id = addInstance(s, 'pick_copper')
    applyCommand(s, { type: 'equip', instanceId: id }, 0)
    const events = applyCommand(s, { type: 'unequip', slot: 'pick' }, 0)
    const notice = events.find((e) => e.type === 'notice') as { text: string } | undefined
    expect(notice, '卸下应给出提示事件').toBeTruthy()
    expect(notice!.text).toContain('已卸下')
    expect(s.slots.pick ?? null).toBeNull()
  })

  it('N3 fmtDur 有天档（赛季/每日倒计时不再显示 336h 0m）', () => {
    expect(fmtDur(14 * 24 * 3_600_000)).toBe('14d 0h')
  })

  it('N4 抽屉收起时显示当前分区（"我在哪"可见）', () => {
    const nav = ui('NavBar.vue')
    expect(nav).toContain('const currentToolLabel = computed(')
    expect(nav).toContain('更多<em v-if="!toolsOpen && currentToolLabel"> · {{ currentToolLabel }}</em>')
    expect(nav).toContain(':class="{ active: currentToolLabel !== null }"')
  })

  it('N5 窄屏提示条抬到常驻底栏之上', () => {
    const t = ui('Toasts.vue')
    const mq = t.slice(t.indexOf('@media (max-width: 900px)'))
    expect(mq).toContain('bottom: calc(66px + env(safe-area-inset-bottom, 0px))')
  })

  it('M3 残余：窄屏行内可点文字撑满行高；图鉴分区标题 ≥40px', () => {
    const rp = ui('RightPanel.vue')
    expect(rp).toMatch(/\.clickable \{[\s\S]{0,220}?align-self: stretch/)
    const cp = ui('CodexPanel.vue')
    expect(cp).toMatch(/@media \(max-width: 900px\) \{[\s\S]{0,120}?min-height: 40px/)
  })
})
