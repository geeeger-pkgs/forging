// ============================================================
// Forging · 可注入随机源（mulberry32）
// 在线模式使用系统随机；测试与复盘使用固定种子
// ============================================================

export interface Rng {
  /** 返回 [0, 1) */
  next(): number
}

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return {
    next() {
      a |= 0
      a = (a + 0x6d2b79f5) | 0
      let t = Math.imul(a ^ (a >>> 15), 1 | a)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    },
  }
}

export function systemRng(): Rng {
  return { next: () => Math.random() }
}

/** 辅助：区间整数 [min, max]（含端点） */
export function randInt(rng: Rng, min: number, max: number): number {
  if (max <= min) return min
  return min + Math.floor(rng.next() * (max - min + 1))
}
