// ============================================================
// Forging · 内容规模报告（v3.0 发布用）
// 设计：docs/design-v3.0.md §2.7 —— 发布文档的"内容规模对比表"由**脚本生成**，不手写
// 运行：node scripts/report-content.mjs  → 打印 Markdown 表 + 落盘 docs/content-scale.json
// ============================================================
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (f) => JSON.parse(readFileSync(join(root, 'data', f), 'utf8'))
const ITEMS = read('items.json')
const RECIPES = read('recipes.json')
const RUNES = read('runes.json')
const AFFIXES = read('affixes.json')
const COMPS = read('companions.json')
const EXP = read('expeditions.json')
const SEASON = read('season.json')
const ABYSS = read('abyss.json')
const ORES = read('ores.json')
const FX = read('fx.json')
const ACH = read('achievements.json')
const ACH_COUNT = Array.isArray(ACH) ? ACH.length : (ACH.achievements?.length ?? 0)

const countByCat = (cat) => Object.values(ITEMS).filter((x) => x.category === cat).length
const rows = [
  ['技能线', 4, 4, '挖矿/熔炼/锻造/强化'],
  ['矿点', 8, ORES.length, `T1~T7 + 煤矿场`],
  ['物品（含符文/遗物）', 0, Object.keys(ITEMS).length, `材料 ${Object.keys(ITEMS).length - countByCat('tool') - countByCat('weapon') - countByCat('armor') - countByCat('jewelry') - countByCat('rune')} / 工具 ${countByCat('tool')} / 武器 ${countByCat('weapon')} / 防具 ${countByCat('armor')} / 饰品 ${countByCat('jewelry')} / 符文 ${countByCat('rune')}`],
  ['配方', 0, RECIPES.length, '熔炼 + 锻造 + 饰品'],
  ['装备槽', 0, 10, '3 工具 + 武器 + 4 防具 + 项链 + 戒指'],
  ['词缀', 0, AFFIXES.affixes.length, `4 池（${Object.values(AFFIXES.pools).map((p) => p.length).join('/')}）`],
  ['符文', 0, RUNES.length, '双槽 + 离线排除'],
  ['远征路线 × 时长', 0, EXP.routes.length, `${EXP.hours.join('/')}h`],
  ['伙伴', 0, COMPS.companions.length, `特质 ${EXP.traits.length} 种`],
  ['赛季', 0, `${SEASON.levels} 级`, `${SEASON.days} 天 / 模板 ${SEASON.templates.length}`],
  ['图鉴条目', 0, Object.keys(ITEMS).length + RECIPES.length + AFFIXES.affixes.length + COMPS.companions.length + ORES.length, '六个分区'],
  ['深渊层词条', 0, ABYSS.mods.length, `每 5 层循环；连打上限 ${ABYSS.challengeMaxFloors}`],
  ['成就', 0, ACH_COUNT, ''],
  ['音效 cue', 0, FX.cues.length, '程序化合成（零资源）'],
]

console.log('| 项目 | v2.0 | v3.0 | 说明 |')
console.log('|---|---|---|---|')
for (const [name, v20, v30, note] of rows) {
  console.log(`| ${name} | ${v20 === 0 ? '—' : v20} | ${v30} | ${note} |`)
}
const out = {
  version: '3.0.0',
  generatedAtNote: '由 scripts/report-content.mjs 生成（勿手改）',
  rows: rows.map(([name, v20, v30, note]) => ({ name, v20: v20 === 0 ? null : v20, v30, note })),
  totals: {
    items: Object.keys(ITEMS).length,
    recipes: RECIPES.length,
    codexEntries: Object.keys(ITEMS).length + RECIPES.length + AFFIXES.affixes.length + COMPS.companions.length + ORES.length,
    achievements: ACH_COUNT,
  },
}
writeFileSync(join(root, 'docs', 'content-scale.json'), JSON.stringify(out, null, 2) + String.fromCharCode(10))
console.log('')
console.log('机器可读：docs/content-scale.json')
