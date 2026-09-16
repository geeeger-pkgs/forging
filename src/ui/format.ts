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
  // 先按目标单位取整、再判进位：否则 59.9s 会输出 '60s' 这种越界写法
  if (s < 10) return `${s.toFixed(1)}s`
  const sec = Math.round(s)
  if (sec < 60) return `${sec}s`
  const m = Math.floor(sec / 60)
  const r = sec % 60
  if (m < 60) return `${m}m ${r}s`
  const h = Math.floor(m / 60)
  // v3.2 修正（评审 N3）：加"天"档。赛季倒计时 14 天原会显示 "336h 0m"（旧文案 "13 天 23 小时" 更好懂）
  if (h >= 48) return `${Math.floor(h / 24)}d ${h % 24}h`
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

/**
 * 档位中文名（T1~T7）：铜/铁/银/金/秘银/星尘/虚空。
 * v3.6.2（backlog：T1~T7 术语对新手是黑话）：提为共享表；玩家可见文案用 `tierLabel()` 加中文注。
 */
export const TIER_CN: Record<number, string> = { 1: '铜', 2: '铁', 3: '银', 4: '金', 5: '秘银', 6: '星尘', 7: '虚空' }

/** 档位可读名：tierLabel(4) = '金档'；未知档位回退 'T{n}' */
export function tierLabel(tier: number): string {
  return TIER_CN[tier] ? `${TIER_CN[tier]}档` : `T${tier}`
}
