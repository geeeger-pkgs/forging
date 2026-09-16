// ============================================================
// Forging · 程序化物品图标（SVG，无外部素材）
// 形状 × 档位配色（铜/铁/银/金/秘银）
// ============================================================
export type ItemShape =
  | 'pick'
  | 'crucible'
  | 'hammer'
  | 'sword'
  | 'mace'
  | 'helmet'
  | 'chest'
  | 'legs'
  | 'boots'
  | 'necklace'
  | 'ring'
  | 'rune'
  | 'ore'
  | 'ingot'
  | 'coal'
  | 'essence'
  | 'crate'
  | 'ember'
  /** v3.0：遗物（齿轮/碎片/核心）与远征徽记 */
  | 'relic'
  | 'token'
  | 'unknown'

const SHAPE_BY_PREFIX: [string, ItemShape][] = [
  ['pick', 'pick'],
  ['crucible', 'crucible'],
  ['hammer', 'hammer'],
  ['sword', 'sword'],
  ['warhammer', 'mace'],
  ['helmet', 'helmet'],
  ['chest', 'chest'],
  ['legs', 'legs'],
  ['boots', 'boots'],
  ['necklace', 'necklace'],
  ['ring', 'ring'],
  ['rune', 'rune'],
  ['ore_', 'ore'],
  ['ingot_', 'ingot'],
  ['relic_', 'relic'],
  ['expedition_token', 'token'],
]

export function shapeOf(itemId: string): ItemShape {
  if (itemId === 'coal') return 'coal'
  if (itemId === 'essence') return 'essence'
  if (itemId === 'crate') return 'crate'
  if (itemId === 'emberstone') return 'ember'
  if (itemId === 'expedition_token') return 'token'
  if (itemId.startsWith('relic_')) return 'relic'
  const hit = SHAPE_BY_PREFIX.find(([p]) => itemId.startsWith(p))
  return hit ? hit[1] : 'unknown'
}

const TIER_COLORS: Record<number, string> = {
  1: '#c98a5b',
  2: '#9aa4b0',
  3: '#cfd6e4',
  4: '#e8c05a',
  5: '#7fd4c1',
  6: '#7f9bff',
  7: '#c26ef0',
}

export function colorOf(itemId: string, tier?: number): string {
  if (tier && TIER_COLORS[tier]) return TIER_COLORS[tier]
  if (itemId === 'coal') return '#3a4152'
  if (itemId === 'essence') return '#b48ef0'
  if (itemId === 'crate') return '#b08756'
  if (itemId === 'emberstone') return '#e5703a'
  if (itemId === 'expedition_token') return '#e8b84b'
  if (itemId === 'relic_gear') return '#c98a5b'
  if (itemId === 'relic_shard') return '#7f9bff'
  if (itemId === 'relic_core') return '#c26ef0'
  return '#8a93ad'
}

/** 返回 24×24 viewBox 内的 SVG 内容片段 */
export function svgFor(shape: ItemShape, c: string): string {
  switch (shape) {
    case 'pick':
      return `<rect x="11" y="6" width="2.4" height="15" rx="1" fill="#8a6a4a"/><path d="M5 9c4-4 10-5 14-3l-1.6 3c-3-1.4-7-1-9.6 1.6z" fill="${c}"/>`
    case 'crucible':
      return `<path d="M6 9h12l-1.6 9H7.6z" fill="${c}"/><rect x="9.6" y="5" width="4.8" height="3" rx="1" fill="#000" opacity="0.3"/><circle cx="12" cy="6.2" r="1.6" fill="${c}"/>`
    case 'hammer':
      return `<rect x="11" y="10" width="2.2" height="11" rx="1" fill="#8a6a4a"/><rect x="6.5" y="4.5" width="11" height="6.5" rx="1.5" fill="${c}"/>`
    case 'sword':
      return `<path d="M12 2l2 13h-4z" fill="${c}"/><rect x="8" y="15" width="8" height="2" rx="1" fill="#8a6a4a"/><rect x="11" y="17" width="2" height="5" rx="1" fill="#8a6a4a"/>`
    case 'mace':
      return `<rect x="11" y="11" width="2.2" height="10" rx="1" fill="#8a6a4a"/><circle cx="12" cy="8" r="5" fill="${c}"/><path d="M12 1.5v2.5M5.2 8h2.6M16.2 8h2.6M12 12.5V15" stroke="${c}" stroke-width="1.6" stroke-linecap="round"/>`
    case 'helmet':
      return `<path d="M5 14a7 7 0 0 1 14 0v3H5z" fill="${c}"/><rect x="8" y="11.5" width="8" height="2" rx="1" fill="#000" opacity="0.3"/>`
    case 'chest':
      return `<path d="M7 4h10l1.5 5v11H5.5V9z" fill="${c}"/><path d="M5.5 12h13" stroke="#000" stroke-width="1.2" opacity="0.3"/>`
    case 'legs':
      return `<rect x="7.5" y="3" width="3.6" height="18" rx="1.4" fill="${c}"/><rect x="12.9" y="3" width="3.6" height="18" rx="1.4" fill="${c}"/>`
    case 'boots':
      return `<path d="M8 3h4v11l4.5 3v3H8z" fill="${c}"/><rect x="8" y="17.5" width="8.5" height="2.5" rx="1" fill="#000" opacity="0.3"/>`
    case 'necklace':
      return `<path d="M4.5 5c0 7 3.4 10 7.5 10s7.5-3 7.5-10" fill="none" stroke="${c}" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="17" r="2.8" fill="${c}"/>`
    case 'ring':
      return `<circle cx="12" cy="14.5" r="5.5" fill="none" stroke="${c}" stroke-width="2.6"/><path d="M12 3.5l2.4 4H9.6z" fill="${c}"/>`
    case 'rune':
      return `<path d="M12 2l7 5.5-2.6 12H7.6L5 7.5z" fill="${c}" opacity="0.92"/><path d="M12 6.5l3.4 2.8-1.3 6H9.9L8.6 9.3z" fill="#fff" opacity="0.28"/>`
    case 'ore':
      return `<path d="M5 18l2-8 5-4 6 3 2 9z" fill="${c}"/><path d="M9 10l3 2 4-1" stroke="#000" stroke-width="1" opacity="0.25"/>`
    case 'ingot':
      return `<path d="M6 17l2-5h8l2 5z" fill="${c}"/><path d="M9 14l.8-2h4.4l.8 2z" fill="#fff" opacity="0.18"/>`
    case 'coal':
      return `<circle cx="12" cy="12" r="7" fill="${c}"/><circle cx="9.5" cy="10" r="2" fill="#fff" opacity="0.12"/>`
    case 'essence':
      return `<path d="M12 2l2.2 7.4L22 12l-7.8 2.6L12 22l-2.2-7.4L2 12l7.8-2.6z" fill="${c}"/>`
    case 'crate':
      return `<rect x="4.5" y="6" width="15" height="12" rx="1.5" fill="${c}"/><path d="M4.5 11h15M12 6v12" stroke="#000" stroke-width="1.2" opacity="0.35"/>`
    case 'relic':
      // 遗物：菱形徽记 + 内环（与符文同族但可区分）
      return `<path d="M12 2.2l7 7.2-7 12.4-7-12.4z" fill="${c}"/><circle cx="12" cy="10.4" r="2.6" fill="#000" opacity="0.28"/><path d="M12 6.6l3 3.8-3 5.6-3-5.6z" fill="#fff" opacity="0.22"/>`
    case 'token':
      // 远征徽记：盾形 + 星
      return `<path d="M12 2.4l7 2.6v6.2c0 4.2-2.9 7.6-7 10.4-4.1-2.8-7-6.2-7-10.4V5z" fill="${c}"/><path d="M12 7.2l1.5 3.2 3.3.3-2.5 2.2.7 3.4L12 14.6l-3 1.7.7-3.4-2.5-2.2 3.3-.3z" fill="#fff" opacity="0.55"/>`
    case 'ember':
      return `<path d="M12 2.5c3.2 4 5.4 6.2 5.4 9.6a5.4 5.4 0 0 1-10.8 0c0-1.6.7-3 1.9-4.4.2 1.4.8 2.3 1.7 2.7-.6-2.6-.2-5 1.8-7.9z" fill="${c}"/><path d="M12 20.5a2.6 2.6 0 0 0 2.4-2.8c0-1.2-.9-2.2-2.4-3.6-1.5 1.4-2.4 2.4-2.4 3.6A2.6 2.6 0 0 0 12 20.5z" fill="#fff" opacity="0.35"/>`
    default:
      return `<circle cx="12" cy="12" r="7" fill="${c}"/>`
  }
}
