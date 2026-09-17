// @vitest-environment jsdom
// ============================================================
// v3.8.0：存档三通道（文件 / 剪贴板 / 粘贴框）+ 清档抑制兜底保存
//
// 实机缺陷回归（本文件的存在理由）：
//   清档重来 = clearSave() + location.reload()，而 reload 会触发 store 的
//   beforeunload 兜底保存，把**内存里的旧档又写回刚清空的槽** ——
//   实机表现是「点了清档重来，进度原封不动」。内核测试测不到，
//   因为它依赖「reload 前的兜底保存」这条只在浏览器里发生的时序。
// ============================================================
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cmd, store } from '../../src/app/store'
import { exportSaveText, importSaveText, saveGame } from '../../src/app/persist'
import { newGame } from '../../src/game/state'
import SettingsPanel from '../../src/ui/components/SettingsPanel.vue'

const KEY = 'forging.save'
const BAK = 'forging.save.bak'

function makeStorage(): Storage {
  const map = new Map<string, string>()
  return {
    getItem: (k: string): string | null => map.get(k) ?? null,
    setItem: (k: string, v: string): void => {
      map.set(k, String(v))
    },
    removeItem: (k: string): void => {
      map.delete(k)
    },
    clear: (): void => map.clear(),
    key: (i: number): string | null => [...map.keys()][i] ?? null,
    get length(): number {
      return map.size
    },
  } as Storage
}

/** 剪贴板桩：jsdom 不实现 navigator.clipboard */
let clipboard = ''

function btn(w: ReturnType<typeof mount>, text: string) {
  const b = w.findAll('button').find((x) => (x.text() || '').includes(text))
  if (!b) throw new Error(`未找到按钮：${text}`)
  return b
}

/**
 * jsdom 的 location.reload 是 [Unforgeable]（vi.spyOn / defineProperty 都会抛
 * "Cannot redefine property"），无法打桩；它本身是 no-op（只往 virtualConsole 记一条
 * "Not implemented: navigation"）。因此本文件不断言「是否重载」，只断言重载前后
 * **存档槽的真实内容** —— 这正是清档缺陷的可见面。
 */
function stubConfirm(): { mockRestore: () => void } {
  return vi.spyOn(window, 'confirm').mockReturnValue(true)
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', { value: makeStorage(), configurable: true })
  clipboard = ''
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: async (t: string): Promise<void> => {
        clipboard = t
      },
      readText: async (): Promise<string> => clipboard,
    },
  })
  const s = newGame('测试', 1000)
  s.gold = 500
  store.state = s
  store.summary = null
  store.ui.view = 'settings'
})

describe('清档重来（v3.8.0 实机缺陷回归）', () => {
  // 顺序敏感：抑制旗标是模块级的、置位后本文件后续用例都不再写盘，
  // 故基线用例必须排在抑制用例之前。
  it('基线：未抑制时 cmd() 确实会写盘（保证下面的用例真能变红）', () => {
    cmd({ type: 'setSettings', patch: { volume: 33 } })
    expect(localStorage.getItem(KEY), '基线写盘路径应正常').toBeTruthy()
  })

  it('清掉两槽后，兜底保存被抑制（旧内存档不再写回）', async () => {
    saveGame(store.state)
    expect(localStorage.getItem(KEY)).toBeTruthy()

    const confirmStub = stubConfirm()

    const w = mount(SettingsPanel)
    await btn(w, '清档重来').trigger('click')

    expect(localStorage.getItem(KEY), '清档后主槽应为空').toBeNull()
    expect(localStorage.getItem(BAK), '清档后备份槽应为空').toBeNull()

    // 模拟 reload 前/自动保存 tick 触发的兜底保存（beforeunload → saveNow）
    cmd({ type: 'setSettings', patch: { volume: 44 } })
    expect(localStorage.getItem(KEY), '被抑制的兜底保存不得把旧档写回').toBeNull()
    expect(localStorage.getItem(BAK)).toBeNull()

    confirmStub.mockRestore()
  })
})

describe('剪贴板 / 粘贴框通道（移动端无法下载上传时的替代路径）', () => {
  it('复制到剪贴板：写出 FGS1 加密串，且能被导入解析回同状态', async () => {
    store.state.gold = 4321
    const w = mount(SettingsPanel)
    await btn(w, '复制到剪贴板').trigger('click')
    // 编解码走 crypto.subtle（真实异步任务，非纯微任务），故用 waitFor 而不是 flushPromises
    await vi.waitFor(() => expect(clipboard.startsWith('FGS1:')).toBe(true), { timeout: 3000 })

    expect(clipboard.includes('"gold"'), '不得是明文 JSON').toBe(false)
    await vi.waitFor(() => expect(w.text()).toContain('已复制加密存档到剪贴板'), { timeout: 3000 })

    const back = await importSaveText(clipboard)
    expect(back).not.toBeNull()
    expect(back!.gold).toBe(4321)
    expect(back!.character.name).toBe('测试')
  })

  it('从剪贴板读取 → 填入粘贴框（核对后可再导入）', async () => {
    const other = newGame('别的矿工', 2000)
    other.gold = 7777
    clipboard = await exportSaveText(other)

    const w = mount(SettingsPanel)
    await btn(w, '从剪贴板读取').trigger('click')
    await flushPromises()

    const box = w.find('textarea.save-paste').element as HTMLTextAreaElement
    expect(box.value.startsWith('FGS1:')).toBe(true)
    expect(w.text()).toContain('已从剪贴板读入')
  })

  it('从文本导入：覆盖当前存档并立即写盘', async () => {
    const other = newGame('别的矿工', 2000)
    other.gold = 7777
    const text = await exportSaveText(other)

    const confirmStub = stubConfirm()

    const w = mount(SettingsPanel)
    await w.find('textarea.save-paste').setValue(text)
    await btn(w, '从文本导入').trigger('click')
    await vi.waitFor(() => expect(store.state.character.name).toBe('别的矿工'), { timeout: 3000 })

    expect(store.state.gold).toBe(7777)
    expect(JSON.parse(localStorage.getItem(KEY)!).gold, '导入后应立刻落盘').toBe(7777)

    confirmStub.mockRestore()
  })

  it('粘贴框为空时「从文本导入」禁用；无效文本 → 报错且不覆盖当前存档', async () => {
    const w = mount(SettingsPanel)
    const importBtn = btn(w, '从文本导入')
    expect(importBtn.attributes('disabled'), '空文本时应禁用').toBeDefined()

    const confirmStub = stubConfirm()

    await w.find('textarea.save-paste').setValue('FGS1:这不是有效的存档')
    await btn(w, '从文本导入').trigger('click')
    await flushPromises()

    expect(store.state.character.name, '导入失败不应改动存档').toBe('测试')
    expect(w.text()).toContain('导入失败')
    expect(localStorage.getItem(KEY), '导入失败不应写盘').toBeNull()

    confirmStub.mockRestore()
  })
})
