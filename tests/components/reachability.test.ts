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
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { store } from '../../src/app/store'
import { addInstance, newGame, materialCount } from '../../src/game/state'
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
