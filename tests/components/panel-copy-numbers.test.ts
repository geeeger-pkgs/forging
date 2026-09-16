// @vitest-environment jsdom
// ============================================================
// v3.4.6：面板文案的**值级**断言（v3.4.5 双人确认评审 B 的发现）
// 起因：深渊商店增长率文案读错字段（growth vs priceGrowth）→ 渲染成「价格逐次上调（）」空括号，
// 而全套 526 项测试仍绿；公式型数字（首通/扫荡/轮换周期）同样是守卫扫不到的裸奔区。
// 本文件把 AbyssPanel 的可复算文案锁到值级：改字段名 / 改公式 → 必红（探针验证过）。
// ============================================================
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { store } from '../../src/app/store'
import { newGame } from '../../src/game/state'
import type { GameState } from '../../src/game/types'
import AbyssPanel from '../../src/ui/components/AbyssPanel.vue'
import CodexPanel from '../../src/ui/components/CodexPanel.vue'
import ExpeditionPanel from '../../src/ui/components/ExpeditionPanel.vue'
import PrestigePanel from '../../src/ui/components/PrestigePanel.vue'
import ShopPanel from '../../src/ui/components/ShopPanel.vue'

const mounted: { unmount: () => void }[] = []
afterEach(() => {
  while (mounted.length) mounted.pop()!.unmount()
})

function boot(mutate?: (s: GameState) => void): GameState {
  const s = newGame('测试', 1000)
  s.meta.bestSkillLevel = 1
  mutate?.(s)
  store.state = s
  store.summary = null
  return s
}

function mountTracked<T extends { unmount: () => void }>(c: T): T {
  mounted.push(c)
  return c
}

function mountPanel(bestFloor = 0): ReturnType<typeof mount> {
  boot((s) => {
    s.abyss.bestFloor = bestFloor
  })
  return mountTracked(mount(AbyssPanel))
}

describe('AbyssPanel 文案值级断言（守卫盲区：空括号 / 公式数字）', () => {
  it('商店增长率列出全部涨价项（priceGrowth；读错字段会渲染空括号）', () => {
    const text = mountPanel().text()
    expect(text, '定向重铸券 priceGrowth=1.3').toContain('定向重铸券 ×1.3')
    expect(text, '永久速度 priceGrowth=1.1').toContain('永久速度 ×1.1')
    expect(text, '不得是空括号').not.toContain('价格逐次上调（）')
  })

  it('记录区公式行从内容表插值（首通 10+2×层 / 扫荡 1+⌊层/20⌋ / 周期 25 与 5）', () => {
    const text = mountPanel(7).text()
    expect(text, 'firstClearCrystal.base/perFloor').toContain('(10 + 2×层)')
    expect(text, 'repeatCrystal.base/perFloor').toContain('1 + ⌊最高层 / 20⌋')
    expect(text, 'ABYSS_CYCLE×themes.length').toContain('主题每 25 层循环')
    expect(text, 'ABYSS_CYCLE').toContain('词条每 5 层轮换')
  })

  it('层词条说明：rich 层（nextFloor=5）显示门槛 ×1.06 / 首通结晶 ×1.5（来自 abyss.mods）', () => {
    const text = mountPanel(4).text() // nextFloor = bestFloor+1 = 5 → floor % 5 = 0 → rich
    expect(text).toContain('（门槛 ×1.06、首通结晶 ×1.5）')
  })

  it('离线回体：每日可打满 24 次 = staminaMax + offlineCapExtra（同源表达式）', () => {
    expect(mountPanel().text()).toContain('每日可打满 24 次')
  })
})

describe('v3.4.6：其余面板的公式/计数型文案值级断言（B 评审漏网清单）', () => {
  it('PrestigePanel 深造示例：迅捷精通 20 → 40 级（perks.json 上限 × 倍率常量）', () => {
    boot()
    const w = mountTracked(mount(PrestigePanel))
    expect(w.text()).toContain('迅捷精通 20 → 40 级')
  })

  it('ShopPanel 工具速度区间：+15.0% → +135.0%（内容表 min/max）', () => {
    boot()
    const w = mountTracked(mount(ShopPanel))
    expect(w.text()).toContain('+15.0% → +135.0%')
  })

  it('ExpeditionPanel 旗帜每级 +8% 队伍战力 / +1 队伍位（banner / team 字段）', () => {
    boot()
    const w = mountTracked(mount(ExpeditionPanel))
    expect(w.text()).toContain('+8% 队伍战力')
    expect(w.text()).toContain('+1 队伍位')
  })

  it('CodexPanel 任务条数：解锁/未解锁两个分支都是 3（SEASON_TASKS_PER_DAY）', async () => {
    boot() // 未解锁：显示「每 N 天轮换 3 条长线任务」
    const locked = mountTracked(mount(CodexPanel))
    await nextTick()
    expect(locked.text()).toContain('3 条长线任务')
    locked.unmount()
    mounted.pop()

    boot((s) => {
      s.meta.seasonUnlockedOnce = true // 解锁赛季区
    })
    const w = mountTracked(mount(CodexPanel))
    await nextTick()
    expect(w.text()).toContain('3 条任务从')
  })

  it('RightPanel 存配装 title：最多 3 套（MAX_GEAR_SETS）', async () => {
    boot()
    const { default: RightPanel } = await import('../../src/ui/components/RightPanel.vue')
    const w = mountTracked(mount(RightPanel))
    await nextTick()
    const btn = w.findAll('button').find((b) => b.text().includes('存配装'))
    expect(btn, '应有「存配装」按钮').toBeTruthy()
    expect(btn!.attributes('title'), 'title 应含 MAX_GEAR_SETS=3').toContain('最多 3 套')
  })
})
