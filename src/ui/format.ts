// ============================================================
// Forging · 显示格式化（v3.2 B4）
// 目的：统一时长与百分比写法（此前 8h / 4.0 小时 / 14 分 33 秒 / 1.5s 混用，测评 B-B4）
//   时长：<60s → "X.Xs"；<60m → "Xm Ys"；其余 → "Xh Ym"
//   百分比：一律一位小数
// ============================================================

/** 时长格式化（毫秒） */
export function fmtDur(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0s'
  const s = ms / 1000
  if (s < 60) return `${s < 10 ? s.toFixed(1) : Math.round(s)}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${Math.round(s % 60)}s`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}

/** 小时数（内容表用小时表达时长：1/4/8 → "1h" / "4h" / "8h"） */
export function fmtHours(hours: number): string {
  return `${hours}h`
}

/** 百分比（一位小数；ratio 为 0~1） */
export function fmtPct(ratio: number, digits = 1): string {
  if (!Number.isFinite(ratio)) return '—'
  return `${(ratio * 100).toFixed(digits)}%`
}
