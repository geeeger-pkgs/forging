// Forging · UI 图标与格式化（v1 用 emoji，后续可替换为 SVG 精灵图）

export function itemIcon(itemId: string): string {
  if (!itemId) return '❔'
  if (itemId.startsWith('ore_')) return '🪨'
  if (itemId.startsWith('ingot_')) return '🧱'
  if (itemId === 'coal') return '⚫'
  if (itemId === 'essence') return '✨'
  if (itemId === 'crate') return '📦'
  if (itemId.startsWith('pick')) return '⛏️'
  if (itemId.startsWith('crucible')) return '🫕'
  if (itemId.startsWith('hammer')) return '🔨'
  if (itemId.startsWith('sword')) return '⚔️'
  if (itemId.startsWith('warhammer')) return '🔨'
  if (itemId.startsWith('helmet')) return '🪖'
  if (itemId.startsWith('chest')) return '🛡️'
  if (itemId.startsWith('legs')) return '👖'
  if (itemId.startsWith('boots')) return '🥾'
  return '❔'
}

export function skillIcon(id: string): string {
  const m: Record<string, string> = { mining: '⛏️', smelting: '🔥', forging: '🔨', enhancing: '✨' }
  return m[id] ?? '❔'
}

/** 符文效果图标（v1.4） */
export const BUFF_ICON: Record<string, string> = {
  speed: '⚡',
  efficiency: '✨',
  rareFind: '🍀',
  enhanceRate: '⚒️',
}

export function buffIcon(effect: string): string {
  return BUFF_ICON[effect] ?? '🔷'
}

export function fmtDuration(ms: number): string {
  const s = ms / 1000
  return `${s.toFixed(s >= 10 ? 0 : 1)}s`
}

export function fmtPct(x: number): string {
  return `${(x * 100).toFixed(2)}%`
}

/** 大数字缩写（万/亿；仅用于展示） */
export function fmtNum(n: number): string {
  if (n >= 1e8) return `${(n / 1e8).toFixed(2)} 亿`
  if (n >= 1e4) return `${(n / 1e4).toFixed(2)} 万`
  return String(Math.round(n))
}
