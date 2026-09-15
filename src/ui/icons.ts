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

export function fmtDuration(ms: number): string {
  const s = ms / 1000
  return `${s.toFixed(s >= 10 ? 0 : 1)}s`
}

export function fmtPct(x: number): string {
  return `${(x * 100).toFixed(2)}%`
}
