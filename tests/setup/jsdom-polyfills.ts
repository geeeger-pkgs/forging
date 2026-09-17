// ============================================================
// v3.3 A1：jsdom 缺口的 polyfill（只作用于有 window 的环境，内核 node 用例不受影响）
// jsdom 没有实现 window.matchMedia；组件用它做"窄屏判定"（如右栏 Tab 展开后滚动、
// 触控尺寸分支）。真实浏览器全部支持，故这里补桩，而不是给组件代码加分支。
// ============================================================
import { webcrypto } from 'node:crypto'

type MqlListener = (e: { matches: boolean; media: string }) => void

// v3.8.0：jsdom 的 crypto 只有 getRandomValues/randomUUID，**没有 SubtleCrypto**，
// 而存档编解码（AES-GCM）依赖它。真实浏览器全部具备，故这里换成 Node 的 webcrypto。
if (typeof window !== 'undefined' && !globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true, writable: true })
}

if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  const factory = (query: string): MediaQueryList => {
    const listeners = new Set<MqlListener>()
    // 依据查询串里的最大宽度做一次静态求值；测试如需窄屏可覆盖 window.innerWidth 后重新查询
    const m = /max-width:\s*(\d+)px/.exec(query)
    const matches = m ? window.innerWidth <= Number(m[1]) : false
    return {
      media: query,
      matches,
      onchange: null,
      addEventListener: (_type: string, cb: EventListenerOrEventListenerObject) => {
        if (typeof cb === 'function') listeners.add(cb as unknown as MqlListener)
      },
      removeEventListener: (_type: string, cb: EventListenerOrEventListenerObject) => {
        if (typeof cb === 'function') listeners.delete(cb as unknown as MqlListener)
      },
      addListener: (cb: MqlListener) => listeners.add(cb),
      removeListener: (cb: MqlListener) => listeners.delete(cb),
      dispatchEvent: () => true,
    } as unknown as MediaQueryList
  }
  Object.defineProperty(window, 'matchMedia', { writable: true, configurable: true, value: factory })
}

// jsdom 未实现 scrollIntoView（组件在窄屏展开分区后会调用）
if (typeof Element !== 'undefined' && typeof Element.prototype.scrollIntoView !== 'function') {
  Element.prototype.scrollIntoView = function scrollIntoView(): void {}
}
