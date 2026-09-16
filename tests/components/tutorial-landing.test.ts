// @vitest-environment jsdom
// ============================================================
// v3.4.5：教程「前往」落点的**效果级**验证（第三轮全应用扫描的第 1 条新手问题）
// 起因：此前 reachability.test.ts 里的用例断言的是 `store.ui.rightTabWanted` 这个**一次性标志**，
// 而同文件先前 mounted 的 RightPanel 仍挂着 watcher，会在断言前把它消费掉（测试隔离问题）。
// 本文件独立成篇：**断言效果**——右栏真的切到了指定分区 / 锻造页真的切到了目标分区。
// ============================================================
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { store } from '../../src/app/store'
import { CONTENT } from '../../src/game/content'
import { newGame } from '../../src/game/state'
import type { GameState } from '../../src/game/types'
import NavBar from '../../src/ui/components/NavBar.vue'
import RightPanel from '../../src/ui/components/RightPanel.vue'

function boot(): GameState {
  const s = newGame('测试', 1000)
  s.meta.bestSkillLevel = 1
  store.state = s
  store.summary = null
  store.ui.view = 'mining'
  store.ui.forgeCategory = 'tool'
  store.ui.searchText = '乱七八糟的搜索词' // 故意留一个搜索词：gotoStep 必须清掉它
  store.ui.rightTabWanted = null
  return s
}

const steps = (CONTENT as unknown as { tutorial: { step: number; title: string; goal: { type: string; itemId?: string } }[] })
  .tutorial

/**
 * v3.4.5：**测试隔离**——每个用例结束后卸载本用例挂载的组件。
 * 否则上一个用例的 RightPanel 仍挂着 watcher，会消费下一个用例置位的 rightTabWanted
 * （此前正是因此让"挂载前请求"用例误报，也解释了我先前在 reachability 里删掉那条用例的原因）。
 */
const mounted: { unmount: () => void }[] = []
const mountTracked = <T extends { unmount: () => void }>(c: T): T => {
  mounted.push(c)
  return c
}
afterEach(() => {
  while (mounted.length) mounted.pop()!.unmount()
})

describe('教程「前往」落点（效果级）', () => {
  beforeEach(() => boot())

  it('craftItem 目标（符文）→ 锻造页 + 符文分区（此前停在"工具"，目标卡不渲染）', async () => {
    const runeStep = steps.find((t) => t.goal.type === 'craftItem' && (t.goal.itemId ?? '').startsWith('rune_'))
    expect(runeStep, '教程应有符文制作步骤').toBeTruthy()
    store.state.flags.tutorial = { current: runeStep!.step, completed: [], claimed: [], progress: 0 }
    const nav = mountTracked(mount(NavBar))
    const go = nav.findAll('button').find((b) => b.text().includes('前往'))
    expect(go, '教程卡应有「前往」').toBeTruthy()
    await go!.trigger('click')
    expect(store.ui.view, '应切到锻造页').toBe('forging')
    expect(store.ui.forgeCategory, '应同步到符文分区').toBe('rune')
    expect(store.ui.searchText, '应清掉搜索词').toBe('')
  })

  it('craftItem 目标（武器）→ 锻造页 + 武器分区', async () => {
    const weaponStep = steps.find((t) => t.goal.type === 'craftItem' && (t.goal.itemId ?? '').includes('sword'))
    expect(weaponStep, '教程应有武器制作步骤').toBeTruthy()
    store.state.flags.tutorial = { current: weaponStep!.step, completed: [], claimed: [], progress: 0 }
    const nav = mountTracked(mount(NavBar))
    await nav.findAll('button').find((b) => b.text().includes('前往'))!.trigger('click')
    expect(store.ui.forgeCategory).toBe('weapon')
  })

  it('equipSlot 目标 → 右栏真的切到「行囊」分区（装备入口在那里）', async () => {
    const eqStep = steps.find((t) => t.goal.type === 'equipSlot')
    expect(eqStep, '教程应有装备步骤').toBeTruthy()
    store.state.flags.tutorial = { current: eqStep!.step, completed: [], claimed: [], progress: 0 }
    // 真实顺序：RightPanel 常驻（App.vue），导航点击发生在其后
    const rp = mountTracked(mount(RightPanel))
    const nav = mountTracked(mount(NavBar))
    await nav.findAll('button').find((b) => b.text().includes('前往'))!.trigger('click')
    await nextTick() // 等 watcher 刷新（'pre' 队列）
    await nextTick() // selectRightTab 内部还有一次 await nextTick()
    expect(rp.find('.rtab[aria-selected="true"]').text(), '右栏应选中「行囊」').toBe('行囊')
    expect(rp.find('#rtabpanel-bag').isVisible(), '行囊分区应可见').toBe(true)
  })

  it('请求发生在面板挂载之前也不会丢（onMounted 兜底消费）', async () => {
    const eqStep = steps.find((t) => t.goal.type === 'equipSlot')!
    store.state.flags.tutorial = { current: eqStep.step, completed: [], claimed: [], progress: 0 }
    const nav = mountTracked(mount(NavBar))
    await nav.findAll('button').find((b) => b.text().includes('前往'))!.trigger('click')
    expect(store.ui.rightTabWanted, '此时应已置位').toBe('bag')
    const rp = mountTracked(mount(RightPanel)) // 后挂载：onMounted 应把它消费掉
    await nextTick()
    await nextTick()
    expect(rp.find('.rtab[aria-selected="true"]').text()).toBe('行囊')
  })

  it('教程卡本身仍显示目标与差量（文案不因清搜索词而丢）', () => {
    const eqStep = steps.find((t) => t.goal.type === 'equipSlot')!
    store.state.flags.tutorial = { current: eqStep.step, completed: [], claimed: [], progress: 0 }
    const nav = mountTracked(mount(NavBar))
    expect(nav.text()).toContain('装备一件工具/武器')
  })
})
