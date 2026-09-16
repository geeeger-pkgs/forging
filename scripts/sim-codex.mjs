// ============================================================
// Forging · 图鉴里程碑分区门槛模拟（v3.0 §2.2c）
// 目的：把"分区门槛"的四档组成实算出来（评审 M1：原线性阈值无证据且不解决问题）
// 运行：node scripts/sim-codex.mjs
// 输出：人读表 + docs/sim-codex-output.json（测试逐字段断言）
//
// 病灶（v2.3 测评 M5）：旧制按总条目均匀取 25/50/75/100%，而"物品+配方"占 88.3%
//   → 50% 档 ≈ "全物品 + 7 条配方"，玩家在单一分区撞墙。
// 方案：每档要求在**每个分区**各达标（req 写进 data/season.json 的 codexMilestones）。
// ============================================================
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (f) => JSON.parse(readFileSync(join(root, 'data', f), 'utf8'))
const ITEMS = read('items.json')
const RECIPES = read('recipes.json')
const AFFIXES = read('affixes.json')
const COMPANIONS = read('companions.json')
const ORES = read('ores.json')
const SEASON = read('season.json')

const relicIds = Object.keys(ITEMS).filter((id) => ITEMS[id].category === 'relic')
const SIZES = {
  items: Object.keys(ITEMS).length - relicIds.length,
  recipes: RECIPES.length,
  affixes: AFFIXES.affixes.length,
  companions: COMPANIONS.companions.length,
  relics: relicIds.length,
  ores: ORES.length,
}
const TOTAL = Object.values(SIZES).reduce((a, b) => a + b, 0)

console.log('═'.repeat(78))
console.log('A. 分区规模（与 codex.ts 的 codexProgress 口径一致）')
console.log('═'.repeat(78))
console.log(`物品 ${SIZES.items} ｜ 配方 ${SIZES.recipes} ｜ 词缀 ${SIZES.affixes} ｜ 伙伴 ${SIZES.companions} ｜ 遗物 ${SIZES.relics} ｜ 矿场 ${SIZES.ores} → 合计 ${TOTAL}`)

console.log('')
console.log('═'.repeat(78))
console.log('B. 四档门槛（分区）与达成组成')
console.log('═'.repeat(78))
const rows = SEASON.codexMilestones.map((m) => {
  const need = Object.entries(m.req).map(([k, r]) => ({ k, need: Math.ceil(SIZES[k] * r), total: SIZES[k], ratio: r }))
  const sum = need.reduce((s, x) => s + x.need, 0)
  return { pct: m.pct, title: m.title, need, sum, linear: sum / TOTAL }
})
console.log(['档位'.padEnd(6), '称号'.padEnd(10), '条目合计'.padStart(8), '线性占比'.padStart(8), '旧制同档'.padStart(10)].join(' | '))
for (const r of rows) {
  const old = Math.ceil(TOTAL * r.pct)
  console.log([`${Math.round(r.pct * 100)}%`.padEnd(6), r.title.padEnd(10), String(r.sum).padStart(8), `${(r.linear * 100).toFixed(1)}%`.padStart(8), `${old} 条`.padStart(10)].join(' | '))
}
console.log('')
for (const r of rows) {
  console.log(
    `  ${Math.round(r.pct * 100)}%「${r.title}」：` + r.need.map((x) => `${x.k} ${x.need}/${x.total}`).join(' ｜ '),
  )
}
console.log('')
const old50 = Math.ceil(TOTAL * 0.5)
console.log(`旧制 50% = ${old50} 条 ≈ 全物品(${SIZES.items}) + 配方 ${old50 - SIZES.items} 条 —— 这是单一分区撞墙的根因`)
console.log(`新制 50% 档要求：物品 ${rows[1].need[0].need} + 配方 ${rows[1].need[1].need} + 其余 ${rows[1].need.slice(2).reduce((s, x) => s + x.need, 0)} = ${rows[1].sum} 条（迫使玩家跨分区收集）`)

console.log('')
console.log('═'.repeat(78))
console.log('C. 可达性与单调性')
console.log('═'.repeat(78))
let ok = true
for (let i = 1; i < rows.length; i++) {
  const prev = rows[i - 1]
  const mono = rows[i].need.every((x, j) => x.need >= prev.need[j].need)
  if (!mono) ok = false
  console.log(`  ${Math.round(prev.pct * 100)}% → ${Math.round(rows[i].pct * 100)}%：各区门槛单调不减 ${mono ? '✅' : '⚠'}`)
}
const full = rows[rows.length - 1].need.every((x) => x.need === x.total)
console.log(`  末档 = 全收集（100%）：${full ? '✅' : '⚠'}`)
console.log(`  结论：${ok && full ? '分区门槛单调且末档为全收集 ✅' : '⚠ 门槛需重定'}`)

const out = {
  version: '3.0.0',
  tableFingerprint: JSON.stringify(SEASON).length,
  sizes: SIZES,
  total: TOTAL,
  milestones: rows.map((r) => ({
    pct: r.pct,
    title: r.title,
    req: Object.fromEntries(r.need.map((x) => [x.k, x.ratio])),
    need: Object.fromEntries(r.need.map((x) => [x.k, x.need])),
    sum: r.sum,
    linear: Number(r.linear.toFixed(4)),
    oldLinearNeed: Math.ceil(TOTAL * r.pct),
  })),
  relicIds,
  monotonic: ok,
  lastIsFull: full,
}
writeFileSync(join(root, 'docs', 'sim-codex-output.json'), JSON.stringify(out, null, 2) + String.fromCharCode(10))
console.log('')
console.log('机器校验输出：docs/sim-codex-output.json')
