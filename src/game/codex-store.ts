// ============================================================
// Forging · 图鉴存储（v3.0 位图）
// 设计：docs/design-v3.0.md §2.2c/§2.5
//
// 为什么改：v2.3 的逗号串在 222 条目下实测 3,359B（且随内容增长线性膨胀）。
// 位图 = 每个 id 1 bit：216 bit = 27B（base64 ≈36 字符），收益 ≈100×。
//
// 关键设计：
//   1. **单一真源**：只存位图。旧档的逗号串在迁移时一次性转成位图（读旧串的能力只在迁移里用）。
//   2. **位序稳定**：id → bit 序来自**内容表顺序**（items/recipes/affixes/ores 的 id 列表）。
//      表变化时指纹（fp）不再匹配 → 按 id 重建位图（老档无损、新增条目自然为"未收集"）。
//   3. 遗物与其他物品**同池登记**（遗物也是 item id）→ 修掉 v2.3 的"计数 3/3 但列表显示未收集"。
// ============================================================
import { CONTENT } from './content'
import type { CodexState } from './types'

/** 四个位图分区（与 CodexState.bits 的分段一一对应） */
export type CodexSection = 'items' | 'recipes' | 'affixes' | 'ores'

const SECTIONS: CodexSection[] = ['items', 'recipes', 'affixes', 'ores']

function idsOf(section: CodexSection): string[] {
  if (section === 'items') return Object.keys(CONTENT.items)
  if (section === 'recipes') return CONTENT.recipes.map((r) => r.id)
  if (section === 'affixes') return CONTENT.affixes.affixes.map((a) => a.id)
  return CONTENT.ores.map((o) => o.id)
}

/** 各分区 id → 全局 bit 下标 */
const INDEX: Record<CodexSection, Map<string, number>> = {
  items: new Map(),
  recipes: new Map(),
  affixes: new Map(),
  ores: new Map(),
}
/** 各分区在全局位图里的起始 bit */
const OFFSET: Record<CodexSection, number> = { items: 0, recipes: 0, affixes: 0, ores: 0 }
let TOTAL_BITS = 0
{
  let off = 0
  for (const sec of SECTIONS) {
    OFFSET[sec] = off
    const ids = idsOf(sec)
    INDEX[sec] = new Map(ids.map((id, i) => [id, off + i]))
    off += ids.length
  }
  TOTAL_BITS = off
}

export const CODEX_TOTAL_BITS = TOTAL_BITS
export const CODEX_BYTES = Math.ceil(TOTAL_BITS / 8)
export const CODEX_SECTIONS = SECTIONS

/**
 * 表指纹：**完整 id 序列**的哈希（v3.0 测评 D5）。
 * 旧实现只取"长度 + 首尾 id"，中段插入/删除条目的内容表变化无法检出 →
 * 用新表解码旧位序会**静默错位**（把 A 的进度算到 B 头上）。
 * 现在任何 id 序列变化都会改变指纹；指纹不符时**不再尝试解码**（见 normalizeCodex）。
 */
function hashIds(ids: string[]): number {
  let h = 2166136261 >>> 0
  for (const id of ids) {
    for (let i = 0; i < id.length; i++) {
      h ^= id.charCodeAt(i)
      h = Math.imul(h, 16777619) >>> 0
    }
    h ^= 0x2c // 分隔符（逗号），避免 "ab"+"c" 与 "a"+"bc" 同哈希
    h = Math.imul(h, 16777619) >>> 0
  }
  return h >>> 0
}

export function codexFingerprint(): string {
  return `${TOTAL_BITS}-${hashIds(SECTIONS.flatMap((sec) => idsOf(sec))).toString(36)}`
}

/** 纯函数版：供测试验证"任何位置增删条目都会改变指纹" */
export function fingerprintOf(sectionIds: Record<CodexSection, readonly string[]>): string {
  const all = SECTIONS.flatMap((sec) => [...(sectionIds[sec] ?? [])])
  return `${all.length}-${hashIds(all).toString(36)}`
}

// ---------------- 编解码 ----------------

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

function toBase64(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0
    out += B64[b0 >> 2]
    out += B64[((b0 & 3) << 4) | (b1 >> 4)]
    out += i + 1 < bytes.length ? B64[((b1 & 15) << 2) | (b2 >> 6)] : '='
    out += i + 2 < bytes.length ? B64[b2 & 63] : '='
  }
  return out
}

function fromBase64(s: string): Uint8Array {
  const clean = s.replace(/[^A-Za-z0-9+/]/g, '')
  const len = Math.floor((clean.length * 3) / 4)
  const out = new Uint8Array(len)
  let p = 0
  for (let i = 0; i < clean.length; i += 4) {
    const c0 = B64.indexOf(clean[i])
    const c1 = B64.indexOf(clean[i + 1] ?? 'A')
    const c2 = B64.indexOf(clean[i + 2] ?? 'A')
    const c3 = B64.indexOf(clean[i + 3] ?? 'A')
    out[p++] = (c0 << 2) | (c1 >> 4)
    if (p < len) out[p++] = ((c1 & 15) << 4) | (c2 >> 2)
    if (p < len) out[p++] = ((c2 & 3) << 6) | c3
  }
  return out
}

/** 空位图 */
export function emptyBits(): string {
  return toBase64(new Uint8Array(CODEX_BYTES))
}

function bytes(bits: string): Uint8Array {
  const b = fromBase64(bits)
  return b.length >= CODEX_BYTES ? b.subarray(0, CODEX_BYTES) : new Uint8Array(CODEX_BYTES)
}

export function hasBit(bits: string, section: CodexSection, id: string): boolean {
  const idx = INDEX[section].get(id)
  if (idx === undefined) return false
  const arr = bytes(bits)
  return (arr[idx >> 3] & (1 << idx % 8)) !== 0
}

export function setBit(bits: string, section: CodexSection, id: string): string {
  const idx = INDEX[section].get(id)
  if (idx === undefined) return bits
  const arr = bytes(bits)
  if ((arr[idx >> 3] & (1 << idx % 8)) !== 0) return bits
  const copy = new Uint8Array(arr)
  copy[idx >> 3] |= 1 << idx % 8
  return toBase64(copy)
}

/** 某分区已收集的 id 集合 */
export function sectionIds(bits: string, section: CodexSection): Set<string> {
  const arr = bytes(bits)
  const out = new Set<string>()
  for (const [id, idx] of INDEX[section]) {
    if ((arr[idx >> 3] & (1 << idx % 8)) !== 0) out.add(id)
  }
  return out
}

/** 某分区已收集数量 */
export function sectionCount(bits: string, section: CodexSection): number {
  const arr = bytes(bits)
  let n = 0
  for (const idx of INDEX[section].values()) {
    if ((arr[idx >> 3] & (1 << idx % 8)) !== 0) n++
  }
  return n
}

/** 分区规模（内容表口径） */
export function sectionTotal(section: CodexSection): number {
  return INDEX[section].size
}

/** 由 id 集合构建位图（迁移与"指纹不符时重建"用） */
export function bitsFromIds(ids: Partial<Record<CodexSection, readonly string[]>>): string {
  const arr = new Uint8Array(CODEX_BYTES)
  for (const sec of SECTIONS) {
    for (const id of ids[sec] ?? []) {
      const idx = INDEX[sec].get(id)
      if (idx !== undefined) arr[idx >> 3] |= 1 << idx % 8
    }
  }
  return toBase64(arr)
}

/** 空的图鉴状态（含指纹） */
export function emptyCodex(): CodexState {
  return { bits: emptyBits(), fp: codexFingerprint() }
}

/**
 * 载入归一化（幂等）：
 *   - 缺 bits → 空位图；指纹不符 → 保留位图内容但按 id 重建（见下）
 *   - 旧档（v12 及以前）由 persist 迁移先转成 bits（此处只兜底）
 */
export function normalizeCodex(state: CodexState, legacy?: Partial<Record<CodexSection, string>>): CodexState {
  const fp = codexFingerprint()
  let bits = state.bits && typeof state.bits === 'string' ? state.bits : ''
  if (!bits) {
    bits = legacy ? bitsFromIds(splitLegacy(legacy)) : emptyBits()
  } else if (state.fp !== fp) {
    // 表变了（任何位置增删条目都会改指纹）→ **旧位序不可信，禁止解码**。
    // 兜底：丢弃位图，交由 checkCodexBackfill 从当前持有物重建（已知损失：
    // 已消耗/已回收的历史条目不再计入；这是"宁可少算，不可错算"的取舍，测评 D5）。
    bits = emptyBits()
  }
  return { bits, fp }
}

/** 旧版逗号串 → id 数组 */
export function splitLegacy(legacy: Partial<Record<CodexSection, string>>): Partial<Record<CodexSection, string[]>> {
  const out: Partial<Record<CodexSection, string[]>> = {}
  for (const sec of SECTIONS) {
    const s = legacy[sec]
    out[sec] = s ? s.split(',').filter((x) => x.length > 0) : []
  }
  return out
}
