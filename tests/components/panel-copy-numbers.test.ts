// @vitest-environment jsdom
// ============================================================
// v3.4.6：面板文案的**值级**断言（v3.4.5 双人确认评审 B 的发现）
// 起因：深渊商店增长率文案读错字段（growth vs priceGrowth）→ 渲染成「价格逐次上调（）」空括号，
// 而全套 526 项测试仍绿；公式型数字（首通/扫荡/轮换周期）同样是守卫扫不到的裸奔区。
// 本文件把 AbyssPanel 的可复算文案锁到值级：改字段名 / 改公式 → 必红（探针验证过）。
// ============================================================
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { store } from '../../src/app/store'
import { newGame } from '../../src/game/state'
import AbyssPanel from '../../src/ui/components/AbyssPanel.vue'

const mounted: { unmount: () => void }[] = []
afterEach(() => {
  while (mounted.length) mounted.pop()!.unmount()
})

function mountPanel(bestFloor = 0): ReturnType<typeof mount> {
  const s = newGame('测试', 1000)
  s.meta.bestSkillLevel = 1
  s.abyss.bestFloor = bestFloor
  store.state = s
  store.summary = null
  const w = mount(AbyssPanel)
  mounted.push(w)
  return w
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
})
