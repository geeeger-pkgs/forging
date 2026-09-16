// @vitest-environment jsdom
// ============================================================
// v3.3 A1/A2：组件级"操作可达性"测试
// 起因：v3.2 的 Blocker（「卸下」按钮永不渲染）在 421 项内核测试全绿的情况下溜过验收 ——
// 内核测的是"命令对不对"，测不到"按钮在不在、点得动点不动"。
// 本文件只断言**可达性**：元素存在 + 交互后 store 状态变化；不测像素、不测样式细节。
// 装配策略（评审 P-B3/§3）：直接挂载 RightPanel / NavBar / ItemDetailModal，
// **不挂 App**（避免 SceneCanvas 的 getContext('2d')、FxLayer、audio 在 jsdom 下拖崩）。
// 环境：逐文件 `@vitest-environment jsdom`（默认仍是 node，内核用例零影响）。
// ============================================================
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { store } from '../../src/app/store'
import { applyCommand } from '../../src/game/commands'
import { HOUR_MS, advanceExpeditions } from '../../src/game/expeditions'
import { mulberry32 } from '../../src/game/rng'
import { CONTENT } from '../../src/game/content'
import { addInstance, materialCount, newGame } from '../../src/game/state'
import type { GameState } from '../../src/game/types'
import ItemDetailModal from '../../src/ui/components/ItemDetailModal.vue'
import NavBar from '../../src/ui/components/NavBar.vue'
import RightPanel from '../../src/ui/components/RightPanel.vue'

/** 每个用例一份干净状态：直接替换 store.state（组件全部读 store.state / store.ui） */
function boot(now = 1_000_000): GameState {
  const s = newGame('测试', now)
  store.state = s
  store.summary = null
  store.toasts.length = 0
  store.ui.view = 'mining'
  store.ui.inspectInstanceId = null
  store.ui.inspectItemId = null
  store.now = now
  return s
}

/** 找按钮：按可见文案匹配（可达性断言以"玩家看得到的文字"为准） */
/** 读组件源码做样式/结构契约断言 */
const uiFile = (name: string) => readFileSync(join(process.cwd(), 'src', 'ui', 'components', name), 'utf8')
/** 找按钮：按可见文案匹配（可达性断言以玩家看得到的文字为准） */
const btn = (w: ReturnType<typeof mount>, text: string) =>
  w.findAll('button').find((b) => (b.text() || '').includes(text))

describe('A1 harness：三个组件能在 jsdom 下挂载并读到 store', () => {
  beforeEach(() => boot())

  it('RightPanel 挂载并渲染出三个分区 Tab', () => {
    const w = mount(RightPanel)
    const tabs = w.findAll('.rtab').map((t) => t.text())
    expect(tabs).toEqual(['装备', '行囊', '资源'])
  })

  it('NavBar 挂载并渲染 4 个技能入口 + 更多开关', () => {
    const w = mount(NavBar)
    expect(w.findAll('.nav .item').length).toBeGreaterThanOrEqual(4)
    expect(w.find('.tools-toggle').exists()).toBe(true)
  })

  it('ItemDetailModal 默认不渲染（无 inspectInstanceId 时不占屏）', () => {
    const w = mount(ItemDetailModal)
    expect(w.find('.detail-dialog').exists()).toBe(false)
  })
})

describe('A2 操作矩阵：v3.2 出过事故的路径逐条走通', () => {
  it('① 槽位 → 详情 → 卸下（v3.2 Blocker 回归）', async () => {
    const s = boot()
    const id = addInstance(s, 'pick_copper')
    s.slots.pick = id
    const rp = mount(RightPanel)
    // 装备分区默认可见（桌面语义），先确认槽位可点
    const slotItem = rp.find('.slots .slot-item')
    expect(slotItem.exists(), '已装备的槽位应可点击').toBe(true)
    await slotItem.trigger('click')
    expect(store.ui.inspectInstanceId, '点槽位应写入详情弹窗状态').toBe(id)
    // 详情弹窗挂载后应出现「卸下」
    const modal = mount(ItemDetailModal)
    await nextTick()
    const unequip = btn(modal, '卸下')
    expect(unequip, '弹窗里必须有卸下入口').toBeTruthy()
    await unequip!.trigger('click')
    expect(s.slots.pick ?? null, '卸下后槽位应清空').toBeNull()
  })

  it('② 行囊 → 装备（装备后槽位写入）', async () => {
    const s = boot()
    const id = addInstance(s, 'pick_copper')
    const rp = mount(RightPanel)
    // 行囊分区在桌面端始终渲染
    const equip = rp.findAll('#rtabpanel-bag .row button').find((b) => b.text().includes('装备'))
    expect(equip, '行囊行应有装备按钮').toBeTruthy()
    await equip!.trigger('click')
    expect(s.slots.pick).toBe(id)
  })

  it('③ 行囊 → 回收（实例从 equipment 移除并进账金币）', async () => {
    const s = boot()
    const id = addInstance(s, 'pick_copper')
    s.equipment.find((e) => e.instanceId === id)!.affixes = []
    const before = s.gold
    const rp = mount(RightPanel)
    const recycle = rp.findAll('#rtabpanel-bag .row button').find((b) => b.text().includes('回收'))
    expect(recycle, '行囊行应有回收按钮').toBeTruthy()
    await recycle!.trigger('click')
    expect(s.equipment.some((e) => e.instanceId === id), '回收后实例应消失').toBe(false)
    expect(s.gold).toBeGreaterThan(before)
  })

  it('④ 右栏 Tab 开合：点「资源」打开、再点收起（aria-selected 同步）', async () => {
    boot()
    const rp = mount(RightPanel)
    const mats = rp.findAll('.rtab').find((t) => t.text() === '资源')!
    expect(mats.attributes('aria-selected')).toBe('false')
    await mats.trigger('click')
    expect(mats.attributes('aria-selected')).toBe('true')
    expect(rp.find('#rtabpanel-mats').isVisible()).toBe(true)
    await mats.trigger('click')
    expect(mats.attributes('aria-selected')).toBe('false')
  })

  it('⑤ 材料「…」菜单：在被点行内展开；空输入时「应用」置灰（v3.2 误设 0 的坑）', async () => {
    const s = boot()
    s.materials['ore_copper'] = 500
    const rp = mount(RightPanel)
    const matsRow = rp.findAll('#rtabpanel-mats .mat-item').find((r) => r.text().includes('铜矿石'))
    expect(matsRow, '应渲染出铜矿石行').toBeTruthy()
    const menuBtn = matsRow!.find('.menu-btn')
    await menuBtn.trigger('click')
    // 菜单必须渲染在**本行内**
    expect(matsRow!.find('.mat-menu').exists(), '菜单应在被点行内').toBe(true)
    const apply = matsRow!.findAll('button').find((b) => b.text() === '应用')!
    expect(apply.attributes('disabled')).toBeDefined()
  })

  it('⑥ 材料「…」→ 回收 1（数量减少、金币增加）', async () => {
    const s = boot()
    s.materials['ore_copper'] = 500
    const gold = s.gold
    const rp = mount(RightPanel)
    const matsRow = rp.findAll('#rtabpanel-mats .mat-item').find((r) => r.text().includes('铜矿石'))!
    await matsRow.find('.menu-btn').trigger('click')
    const r1 = matsRow.findAll('button').find((b) => b.text() === '回收 1')!
    await r1.trigger('click')
    expect(materialCount(s, 'ore_copper')).toBe(499)
    expect(s.gold).toBeGreaterThan(gold)
  })

  it('⑦ 抽屉开关：点「更多」展开出 8 个工具入口', async () => {
    boot()
    const nav = mount(NavBar)
    const toggle = nav.find('.tools-toggle')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    await toggle.trigger('click')
    expect(toggle.attributes('aria-expanded')).toBe('true')
    const names = nav.findAll('#nav-tools .item').map((b) => b.text())
    for (const n of ['传承', '任务', '远征', '图鉴', '深渊', '商店', '成就', '设置']) {
      expect(names.some((x) => x.includes(n)), `抽屉里应有「${n}」`).toBe(true)
    }
  })

  it('⑧ 选中工具：视图切换 + 抽屉自动收起（v3.2 评审 N4）', async () => {
    boot()
    const nav = mount(NavBar)
    await nav.find('.tools-toggle').trigger('click')
    const codex = nav.findAll('#nav-tools .item').find((b) => b.text().includes('图鉴'))!
    await codex.trigger('click')
    expect(store.ui.view).toBe('codex')
    expect(nav.find('.tools-toggle').attributes('aria-expanded')).toBe('false')
  })

  it('⑨ 教程卡「前往」：把玩家送到目标视图', async () => {
    const s = boot()
    s.flags.tutorial = { current: 1, completed: [], claimed: [], progress: 0 }
    const nav = mount(NavBar)
    const go = btn(nav, '前往')
    expect(go, '教程卡应有「前往」').toBeTruthy()
    await go!.trigger('click')
    expect(store.ui.view).toBe('mining')
  })

  it('⑩ 成就面板：未完成项显示 当前/目标（含 0/N，v3.2 评审 Minor）', async () => {
    const s = boot()
    // 取一个 stat 类未完成成就的进度：直接断言组件渲染出的进度行数量 > 0
    store.ui.view = 'achievements'
    const mod = await import('../../src/ui/components/AchievementsPanel.vue')
    const w = mount(mod.default)
    const rows = w.findAll('.prog')
    expect(rows.length, '未完成成就应显示进度行').toBeGreaterThan(0)
    expect(rows.some((r) => /^\s*\d+\s*\/\s*\d+\s*$/.test(r.text()))).toBe(true)
    expect(s.stats).toBeTruthy()
  })

  it('⑪ 装备套装：存配装走内联输入（不再有系统 prompt，v3.2 DoD）', async () => {
    const s = boot()
    const id = addInstance(s, 'pick_copper')
    s.slots.pick = id
    const prompts: string[] = []
    // 若组件再调用 window.prompt，本用例应失败
    ;(window as unknown as { prompt: unknown }).prompt = (msg: string) => {
      prompts.push(msg)
      return 'x'
    }
    const rp = mount(RightPanel)
    const save1 = btn(rp, '存配装')!
    await save1.trigger('click')
    expect(prompts, '不得调用系统 prompt').toEqual([])
    expect(rp.find('.gearsets input').exists(), '应出现内联输入').toBe(true)
  })

  it('⑫ 材料「关自动」：开启后再关闭，autoRecycle 回落 undefined', async () => {
    const s = boot()
    s.materials['ore_copper'] = 500
    s.meta.autoRecycle = { ore_copper: 10 }
    const rp = mount(RightPanel)
    const matsRow = rp.findAll('#rtabpanel-mats .mat-item').find((r) => r.text().includes('铜矿石'))!
    await matsRow.find('.menu-btn').trigger('click')
    const off = matsRow.findAll('button').find((b) => b.text() === '关自动')
    expect(off, '已开启自动回收时应出现「关自动」').toBeTruthy()
    await off!.trigger('click')
    expect(s.meta.autoRecycle?.ore_copper).toBeUndefined()
  })
})

// ============================================================
// v3.3 C 组：交互补完（徽标 / 方向键 / 键盘化 / 回收二次确认）
// ============================================================
describe('C 组：交互补完', () => {
  it('C1 徽标：无待领取时不存在；有远征待领取时显示数量', async () => {
    const s = boot()
    const nav1 = mount(NavBar)
    expect(nav1.find('.badge').exists(), '没有可领奖励时不应出现徽标').toBe(false)
    // 造一个"已完成待领取"的远征 run
    s.meta.expeditions.runs.push({
      id: 1,
      routeId: CONTENT.expeditions.routes[0].id,
      hours: 1,
      startedAt: 0,
      endsAt: 1,
      team: [],
      done: true,
      outcome: null,
    })
    const nav2 = mount(NavBar)
    const badge = nav2.find('.badge')
    expect(badge.exists(), '有待领取远征时应出现徽标').toBe(true)
    expect(badge.text()).toBe('1')
  })

  it('C1 徽标：教程已完成未领取也算一项', async () => {
    const s = boot()
    s.flags.tutorial = { current: 1, completed: [1], claimed: [], progress: 1 }
    const nav = mount(NavBar)
    expect(nav.find('.badge').text()).toBe('1')
  })

  it('C2 方向键：→ 切到下一分区并打开；Home/End 跳首尾', async () => {
    boot()
    const rp = mount(RightPanel)
    const nav = rp.find('.rtabs')
    await nav.trigger('keydown', { key: 'ArrowRight' })
    await nextTick()
    expect(rp.findAll('.rtab').find((t) => t.text() === '行囊')!.attributes('aria-selected')).toBe('true')
    await nav.trigger('keydown', { key: 'End' })
    await nextTick()
    expect(rp.findAll('.rtab').find((t) => t.text() === '资源')!.attributes('aria-selected')).toBe('true')
    await nav.trigger('keydown', { key: 'Home' })
    await nextTick()
    expect(rp.findAll('.rtab').find((t) => t.text() === '装备')!.attributes('aria-selected')).toBe('true')
  })

  it('C2 roving tabindex：收起时「装备」留在 Tab 序列，其余为 -1', async () => {
    boot()
    const rp = mount(RightPanel)
    const tabs = rp.findAll('.rtab')
    expect(tabs[0].attributes('tabindex')).toBe('0')
    expect(tabs[1].attributes('tabindex')).toBe('-1')
    expect(tabs[2].attributes('tabindex')).toBe('-1')
  })

  it('C3 材料名 / 行囊名可键盘激活（Enter）', async () => {
    const s = boot()
    s.materials['ore_copper'] = 5
    const id = addInstance(s, 'pick_copper')
    const rp = mount(RightPanel)
    const names = rp.findAll('.clickable')
    expect(names.length).toBeGreaterThan(0)
    for (const n of names) {
      expect(n.attributes('role'), '可点文字应有 button 语义').toBe('button')
      expect(n.attributes('tabindex')).toBe('0')
    }
    // 行囊行 Enter → 打开详情
    const bagName = rp.findAll('#rtabpanel-bag .clickable')[0]
    await bagName.trigger('keyup', { key: 'Enter' })
    expect(store.ui.inspectInstanceId).toBe(id)
  })

  it('C4 高价值回收：确认框出现且取消时不回收；低价值不打扰', async () => {
    const s = boot()
    const id = addInstance(s, 'pick_copper')
    const inst = s.equipment.find((e) => e.instanceId === id)!
    // 高完美度：满词缀 → 触发确认
    inst.affixes = Array.from({ length: 4 }, () => ({ id: 'keen', value: 1 }))
    const calls: string[] = []
    let answer = false
    ;(window as unknown as { confirm: unknown }).confirm = (msg: string) => {
      calls.push(msg)
      return answer
    }
    const rp = mount(RightPanel)
    const recycle = () => rp.findAll('#rtabpanel-bag .row button').find((b) => b.text().includes('回收'))!
    await recycle().trigger('click')
    expect(calls.length, '高完美度回收应弹确认').toBe(1)
    expect(s.equipment.some((e) => e.instanceId === id), '取消后不应回收').toBe(true)
    answer = true
    await recycle().trigger('click')
    expect(s.equipment.some((e) => e.instanceId === id), '确认后应回收').toBe(false)
  })
})

// ---- v3.3 评审处置：新增/修正的交互分支补测 ----
describe('评审处置回归（v3.3 复审）', () => {
  it('C2：键盘按到"已展开分区"只保持选中，不收起（实机抓到的分支）', async () => {
    boot()
    const rp = mount(RightPanel)
    const nav = rp.find('.rtabs')
    await nav.trigger('keydown', { key: 'End' }) // 打开资源
    await nextTick()
    expect(rp.find('#rtabpanel-mats').isVisible()).toBe(true)
    await nav.trigger('keydown', { key: 'End' }) // 再按 End：应仍是展开状态
    await nextTick()
    expect(rp.find('#rtabpanel-mats').isVisible(), '停在已展开分区不得收起').toBe(true)
  })

  it('C4：强化 +3 的装备即便完美度低也触发确认（强化投入不返还）', async () => {
    const s = boot()
    const id = addInstance(s, 'pick_copper')
    const inst = s.equipment.find((e) => e.instanceId === id)!
    inst.affixes = []
    inst.enhanceLevel = s.constructor ? 3 : 3
    const calls: string[] = []
    ;(window as unknown as { confirm: unknown }).confirm = (m: string) => {
      calls.push(String(m))
      return false
    }
    const rp = mount(RightPanel)
    const recycle = rp.findAll('#rtabpanel-bag .row button').find((b) => b.text().includes('回收'))!
    await recycle.trigger('click')
    expect(calls.length, '有强化投入的装备回收应确认').toBe(1)
    expect(calls[0]).toContain('强化 +3 的投入不返还')
    expect(s.equipment.some((e) => e.instanceId === id), '拒绝后应保留').toBe(true)
  })

  it('C1：远征项徽标只报远征待领数（不混入教程）', async () => {
    const s = boot()
    s.flags.tutorial = { current: 1, completed: [1], claimed: [], progress: 1 } // 教程可领 1
    const nav = mount(NavBar)
    const row = nav.findAll('#nav-tools .item').find((b) => b.text().includes('远征'))!
    expect(row.find('.badge').exists(), '只有教程可领时，远征项不应有徽标').toBe(false)
    expect(nav.find('.tools-toggle .badge').text()).toBe('1') // 开关报总数
    s.meta.expeditions.runs.push({
      id: 9, routeId: CONTENT.expeditions.routes[0].id, hours: 1, startedAt: 0, endsAt: 1,
      team: [], done: true, outcome: null,
    })
    const nav2 = mount(NavBar)
    const row2 = nav2.findAll('#nav-tools .item').find((b) => b.text().includes('远征'))!
    expect(row2.find('.badge').text()).toBe('1')
    expect(nav2.find('.tools-toggle .badge').text()).toBe('2')
  })

  it('C3：窄屏 .clickable 触控高度 40px（样式契约）', () => {
    const rp = uiFile('RightPanel.vue')
    const mq = rp.slice(rp.indexOf('v3.3 评审：窄屏触控高度'))
    expect(mq).toMatch(/@media \(max-width: 900px\) \{[\s\S]{0,200}?min-height: 40px/)
  })
})

// ============================================================
// v3.4 B3：组件矩阵 5 缺口（v3.3 评审 M6：这些路径仍可能重演"死按钮"事故）
// 配装应用/删除 · 材料回收 10 / 全部回收 · 强化动作 · 深渊挑战 · 远征领取
// ============================================================
describe('B3 操作矩阵扩面', () => {
  it('配装：应用（一键穿戴）与删除（✕）都可达', async () => {
    const s = boot()
    const a = addInstance(s, 'pick_copper')
    s.slots.pick = a
    s.meta.gearSets = [{ id: 'gs1', name: '挖矿套', slots: { pick: a } }]
    const rp = mount(RightPanel)
    // 应用：卸下后再一键穿回
    delete s.slots.pick
    const apply = rp.findAll('.gearsets button').find((b) => b.text().includes('挖矿套'))!
    await apply.trigger('click')
    expect(s.slots.pick, '应用配装应把装备穿回').toBe(a)
    // 删除
    const del = rp.findAll('.gearsets button').find((b) => b.text() === '✕')!
    await del.trigger('click')
    expect(s.meta.gearSets.length, '删除后配装应消失').toBe(0)
  })

  it('材料：回收 10 与全部回收都可达（全部回收走确认）', async () => {
    const s = boot()
    s.materials['ore_copper'] = 25
    ;(window as unknown as { confirm: unknown }).confirm = () => true
    const rp = mount(RightPanel)
    const row = rp.findAll('#rtabpanel-mats .mat-item').find((r) => r.text().includes('铜矿石'))!
    await row.find('.menu-btn').trigger('click')
    await row.findAll('button').find((b) => b.text() === '回收 10')!.trigger('click')
    expect(materialCount(s, 'ore_copper')).toBe(15)
    await row.find('.menu-btn').trigger('click')
    await row.findAll('button').find((b) => b.text() === '全部回收')!.trigger('click')
    expect(materialCount(s, 'ore_copper') ?? 0).toBe(0)
  })

  it('远征：待领取的 run 有「领取」入口且可点（徽标导流的目标操作）', async () => {
    const s = boot()
    // 走真实流程造一个可领取的 run（内核路径，避免手搓 outcome 形状）
    s.materials['ingot_copper'] = 999
    const team = Object.keys(s.companions) // newGame 已给初始伙伴
    applyCommand(s, { type: 'dispatchExpedition', routeId: 'outskirts', hours: 8, team }, 0, mulberry32(1))
    const run = s.meta.expeditions.runs[0]
    if (!run) throw new Error('未派出远征（路由/队伍前提不满足）')
    advanceExpeditions(s, 9 * HOUR_MS, 'expectation', null)
    expect(s.meta.expeditions.runs[0].done, '推进后应变为待领取').toBe(true)
    store.ui.view = 'expedition'
    const mod = await import('../../src/ui/components/ExpeditionPanel.vue')
    const w = mount(mod.default)
    const claim = w.findAll('button').find((b) => b.text().includes('领取'))
    expect(claim, '待领取远征应有领取按钮').toBeTruthy()
    await claim!.trigger('click')
    expect(s.meta.expeditions.runs.length, '领取后 run 应移除').toBe(0)
  })
})

describe('v3.4 处置回归：重掷与审计', () => {
  it('B4 付费重掷：确认框出现且取消不扣金（免费档不打扰）', async () => {
    const s = boot()
    const t = s.meta.tasks
    if (!t.daily.length) {
      const { refreshTasks } = await import('../../src/game/tasks')
      refreshTasks(s, 0)
    }
    store.ui.view = 'tasks'
    const mod = await import('../../src/ui/components/TasksPanel.vue')
    // 免费档：不应弹确认
    t.rerollsLeft = 1
    let calls: string[] = []
    ;(window as unknown as { confirm: unknown }).confirm = (m: string) => { calls.push(String(m)); return true }
    const w1 = mount(mod.default)
    const rerollBtn1 = w1.findAll('button').find((b) => b.text() === '重掷')
    if (rerollBtn1) {
      await rerollBtn1.trigger('click')
      expect(calls.length, '免费重掷不应弹确认').toBe(0)
    }
    // 付费档：应弹确认，取消则金币不变
    t.rerollsLeft = 0
    t.paidRerollsLeft = 3
    const goldBefore = s.gold
    calls = []
    ;(window as unknown as { confirm: unknown }).confirm = (m: string) => { calls.push(String(m)); return false }
    const w2 = mount(mod.default)
    const rerollBtn2 = w2.findAll('button').find((b) => b.text() === '重掷')
    expect(rerollBtn2, '应有重掷入口').toBeTruthy()
    await rerollBtn2!.trigger('click')
    expect(calls.length, '付费重掷应弹确认').toBe(1)
    expect(calls[0]).toContain('花费 100 金')
    expect(s.gold, '取消后不应扣金').toBe(goldBefore)
  })
})
