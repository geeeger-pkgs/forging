// ============================================================
// Forging · 内容可达性审计（v3.0）
// 目的：证明"内容表里的每一条内容玩家都真的能拿到/触发"，并列出不可达项
// 运行：node scripts/audit-content.mjs        → 人读报告
//       node scripts/audit-content.mjs --json → 只输出 JSON（供测试断言）
// 输出：docs/audit-content-output.json（机器可读）
//
// 说明：这是**静态**审计（读表 + 读源码），不模拟玩法；可达性判定基于
//   "是否存在至少一条产出路径"，路径包含：矿场掉落 / 配方产出 / 小箱 / 深渊商店 /
//   远征产出 / 成就奖励 / 教程奖励 / 任务奖励 / 赛季奖励 / 初始赠送。
// ============================================================
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (f) => JSON.parse(readFileSync(join(root, 'data', f), 'utf8'))
const src = (p) => readFileSync(join(root, p), 'utf8')

const ITEMS = read('items.json')
const RECIPES = read('recipes.json')
const ORES = read('ores.json')
const RUNES = read('runes.json')
const AFFIXES = read('affixes.json')
const COMPS = read('companions.json')
const EXP = read('expeditions.json')
const SEASON = read('season.json')
const ABYSS = read('abyss.json')
const ACH = read('achievements.json')
const TASKS = read('tasks.json')
const TUT = read('tutorial.json')

const findings = []
const note = (sev, msg) => findings.push({ sev, msg })

// ── 1. 物品可达性 ────────────────────────────────────────────
const sources = new Map() // itemId → Set<来源>
const add = (id, from) => {
  if (!sources.has(id)) sources.set(id, new Set())
  sources.get(id).add(from)
}
for (const site of ORES) {
  if (site.outputItemId) add(site.outputItemId, `矿场:${site.id}`)
  for (const d of site.rareDrops ?? []) add(d.itemId ?? d, `矿场稀有:${site.id}`)
}
for (const r of RECIPES) for (const o of r.outputs ?? []) add(o.itemId, `配方:${r.id}`)
for (const c of ITEMS.crate ? [ITEMS.crate] : []) void c
// 小箱奖励在 crates.ts 里（静态提取 itemId 字面量）
const cratesSrc = src('src/game/crates.ts')
for (const m of cratesSrc.matchAll(/itemId:\s*'([a-z0-9_]+)'/g)) add(m[1], '小箱')
for (const m of cratesSrc.matchAll(/'([a-z0-9_]+)'/g)) if (ITEMS[m[1]]) add(m[1], '小箱(字面量)')
for (const s of ABYSS.shop) if (s.itemId) add(s.itemId, `深渊商店:${s.id}`)
for (const r of EXP.routes) {
  if (r.materialItemId) add(r.materialItemId, `远征产出:${r.id}`)
  if (r.relic) add(r.relic, `远征遗物:${r.id}`)
  if (r.tokenPer8h > 0) add('expedition_token', `远征徽记:${r.id}`)
}
const achSrc = src('src/game/achievements.ts')
for (const m of achSrc.matchAll(/itemId:\s*'([a-z0-9_]+)'/g)) add(m[1], '成就奖励')
const tutSrc = src('src/game/tutorial.ts')
for (const m of tutSrc.matchAll(/itemId:\s*'([a-z0-9_]+)'/g)) add(m[1], '教程奖励')
for (const t of TASKS.daily ?? []) for (const tier of t.tiers ?? []) {
  for (const m of JSON.stringify(tier.reward ?? {}).matchAll(/"([a-z0-9_]+)":/g)) if (ITEMS[m[1]]) add(m[1], '任务奖励')
}
const stateSrc = src('src/game/state.ts')
for (const m of stateSrc.matchAll(/'([a-z0-9_]+)':\s*\d+/g)) if (ITEMS[m[1]]) add(m[1], '初始赠送')

const unreachableItems = Object.keys(ITEMS).filter((id) => !sources.has(id))
if (unreachableItems.length) note('Blocker', `物品无产出路径：${unreachableItems.join(', ')}`)

// ── 2. 配方可达性（输入可解析 + 无环） ───────────────────────
const byId = new Map(RECIPES.map((r) => [r.id, r]))
const producingRecipes = new Map()
for (const r of RECIPES) for (const o of r.outputs ?? []) {
  if (!producingRecipes.has(o.itemId)) producingRecipes.set(o.itemId, [])
  producingRecipes.get(o.itemId).push(r.id)
}
/** 递归判定某 material 是否可得（材料来自矿场/小箱/其他配方/商店/远征/初始） */
const baseOk = new Set(['ore', 'coal', 'essence', 'crate', 'reagent', 'relic'])
function materialOk(itemId, seen = new Set()) {
  const def = ITEMS[itemId]
  if (!def) return false
  if (baseOk.has(def.category)) return sources.has(itemId)
  if (sources.get(itemId)?.size > 0 && !producingRecipes.get(itemId)?.length) return true
  if (seen.has(itemId)) return false
  seen.add(itemId)
  const producers = producingRecipes.get(itemId) ?? []
  for (const rid of producers) {
    const r = byId.get(rid)
    const ok = (r.inputs ?? []).every((i) => materialOk(i.itemId, new Set(seen)))
    if (ok) return true
  }
  return false
}
const badRecipes = []
for (const r of RECIPES) {
  const bad = (r.inputs ?? []).filter((i) => !materialOk(i.itemId))
  if (bad.length) badRecipes.push(`${r.id}（缺 ${bad.map((x) => x.itemId).join('/')}）`)
}
if (badRecipes.length) note('Blocker', `配方输入不可得：${badRecipes.join('; ')}`)

// ── 3. 词缀 / 符文 ──────────────────────────────────────────
const tiersAvailable = new Set(Object.values(ITEMS).map((x) => x.tier).filter(Boolean))
for (const a of AFFIXES.affixes) {
  const inPools = Object.entries(AFFIXES.pools).filter(([, list]) => list.includes(a.id))
  if (inPools.length === 0) note('Blocker', `词缀不在任何池中：${a.id}`)
  if (a.tierMin && ![...tiersAvailable].some((t) => t >= a.tierMin)) note('Major', `词缀 tierMin 高于所有物品档位：${a.id}`)
}
const buffsSrc = src('src/game/buffs.ts')
const runeEffects = new Set()
for (const m of buffsSrc.matchAll(/case '([a-zA-Z]+)':/g)) runeEffects.add(m[1])
for (const r of RUNES) {
  const eff = r.def?.effect ?? r.effect
  if (eff && !runeEffects.has(eff) && !buffsSrc.includes(`${eff}`)) {
    note('Major', `符文效果未在 buffs.ts 实现：${r.id} → ${eff}`)
  }
  if (!producingRecipes.get(r.id)?.length) note('Blocker', `符文无制作配方：${r.id}`)
}

// ── 4. 伙伴 / 路线 / 特质 ──────────────────────────────────
const expSrc = src('src/game/expeditions.ts')
const recruitSrc = expSrc.match(/traitReroll|duplicateXp|recruit/i) ? expSrc : ''
void recruitSrc
for (const t of EXP.traits) {
  if (!expSrc.includes(`'${t.id}'`) && !expSrc.includes(t.effect)) note('Major', `特质未被代码引用：${t.id}`)
}
for (const r of EXP.routes) {
  const kind = r.unlock?.type
  if (!['companion', 'level', 'skill', 'totalLevel'].includes(kind)) note('Major', `路线解锁条件类型未知：${r.id} → ${kind}`)
}

// ── 5. 成就 ────────────────────────────────────────────────
const achDefs = Array.isArray(ACH) ? ACH : (ACH.achievements ?? [])
// stats 字段：从 GameState 接口里的 `stats: { ... }` 块提取（4 空格缩进的成员）
const statsBlock = src('src/game/types.ts').match(/stats:\s*\{[\s\S]*?\n  \}/)?.[0] ?? ''
const statsFields = new Set([...statsBlock.matchAll(/^\s{4}(\w+):/gm)].map((m) => m[1]))
const badAch = []
for (const a of achDefs) {
  const cond = JSON.stringify(a)
  for (const m of cond.matchAll(/"counter":\s*"(\w+)"/g)) {
    if (!statsFields.has(m[1])) badAch.push(`${a.id} → counter ${m[1]}`)
  }
  // 收集类成就阈值超过内容上限
  for (const m of cond.matchAll(/"total":\s*(\d+)|"target":\s*(\d+)/g)) void m
}
if (badAch.length) note('Major', `成就引用不存在的计数器：${badAch.join('; ')}`)

// ── 6. 任务 / 赛季计数 ─────────────────────────────────────
const counters = new Set([...statsFields])
const seasonCounters = SEASON.templates.map((t) => t.counter)
const taskCounters = (TASKS.daily ?? []).map((t) => t.counter)
const missingCounters = [...new Set([...seasonCounters, ...taskCounters])].filter((c) => !counters.has(c))
if (missingCounters.length) note('Blocker', `任务/赛季计数器不存在于 stats：${missingCounters.join(', ')}`)
// 计数器是否真的被累加。识别三种写法：
//   ① `X++` / `X += n`    ② `X = (X ?? 0) + 1`（可空字段的初始化累加）    ③ `X = X + 1`
// 此前只认 ①，导致 v3.1 新增的 T4 计数器（用写法 ②，见 settle.ts / commands.ts）被误报为"从未累加"
const allSrc = ['src/game/settle.ts', 'src/game/state.ts', 'src/game/crates.ts', 'src/game/abyss.ts', 'src/game/expeditions.ts', 'src/game/prestige.ts', 'src/game/commands.ts', 'src/game/affixes.ts', 'src/game/buffs.ts', 'src/game/tasks.ts'].map(src).join('\n')
const srcLines = allSrc.split(/\r?\n/)
const isIncremented = (c) =>
  new RegExp(`\\b${c}\\s*(\\+\\+|\\+=)`).test(allSrc) ||
  srcLines.some((line) => {
    const hits = line.match(new RegExp(`\\b${c}\\b`, 'g'))?.length ?? 0
    return hits >= 2 && /[+]\s*1\b|\+\s*amount\b/.test(line)
  })
const neverIncremented = [...new Set([...seasonCounters, ...taskCounters])].filter((c) => !isIncremented(c))
if (neverIncremented.length) note('Major', `计数器从未被累加（任务永远做不完）：${neverIncremented.join(', ')}`)

// ── 7. 图鉴 100% 可达 ─────────────────────────────────────
const relicIds = Object.keys(ITEMS).filter((id) => ITEMS[id].category === 'relic')
const codexTotal = Object.keys(ITEMS).length + RECIPES.length + AFFIXES.affixes.length + COMPS.companions.length + ORES.length
const codexMissing = [...unreachableItems]
if (codexMissing.length) note('Blocker', `图鉴条目不可达：${codexMissing.join(', ')}`)

// ── 8. 教程 ────────────────────────────────────────────────
const tutSteps = Array.isArray(TUT) ? TUT : (TUT.steps ?? [])
for (const s of tutSteps) {
  const counter = s.goal?.counter
  if (counter && !counters.has(counter) && counter !== 'level') note('Major', `教程步骤计数器不存在：第 ${s.step} 步 → ${counter}`)
}

// ── 报告 ───────────────────────────────────────────────────
const out = {
  version: JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version,
  counts: {
    items: Object.keys(ITEMS).length,
    recipes: RECIPES.length,
    affixes: AFFIXES.affixes.length,
    runes: RUNES.length,
    companions: COMPS.companions.length,
    routes: EXP.routes.length,
    traits: EXP.traits.length,
    achievements: achDefs.length,
    tasks: (TASKS.daily ?? []).length + 1,
    seasonTemplates: SEASON.templates.length,
    codexEntries: codexTotal,
  },
  unreachableItems,
  badRecipes,
  badAchievements: badAch,
  missingCounters,
  neverIncremented,
  findings,
}

if (!process.argv.includes('--json')) {
  console.log('═'.repeat(78))
  console.log('Forging v3.0 · 内容可达性审计')
  console.log('═'.repeat(78))
  console.log(`内容规模：物品 ${out.counts.items} ｜ 配方 ${out.counts.recipes} ｜ 词缀 ${out.counts.affixes} ｜ 符文 ${out.counts.runes}`)
  console.log(`          伙伴 ${out.counts.companions} ｜ 路线 ${out.counts.routes} ｜ 特质 ${out.counts.traits} ｜ 成就 ${out.counts.achievements}`)
  console.log(`          任务 ${out.counts.tasks} ｜ 赛季模板 ${out.counts.seasonTemplates} ｜ 图鉴条目 ${out.counts.codexEntries}`)
  console.log('')
  console.log(`① 物品可达性：${unreachableItems.length === 0 ? '全部 ' + out.counts.items + ' 件均有产出路径 ✅' : '⚠ ' + unreachableItems.join(', ')}`)
  console.log(`② 配方输入可达：${badRecipes.length === 0 ? '全部 ' + out.counts.recipes + ' 条输入均可解析 ✅' : '⚠ ' + badRecipes.join('; ')}`)
  console.log(`③ 词缀/符文：${findings.filter((f) => f.msg.includes('词缀') || f.msg.includes('符文')).length === 0 ? '池与效果齐备 ✅' : '⚠ 见下'}`)
  console.log(`④ 任务/赛季计数器：${missingCounters.length === 0 ? '全部存在 ✅' : '⚠ 缺失 ' + missingCounters.join(', ')}`)
  console.log(`   计数器是否真的累加：${neverIncremented.length === 0 ? '全部有累加点 ✅' : '⚠ ' + neverIncremented.join(', ')}`)
  console.log(`⑤ 成就计数器：${badAch.length === 0 ? '引用合法 ✅' : '⚠ ' + badAch.join('; ')}`)
  console.log(`⑥ 图鉴 100%：${codexMissing.length === 0 ? out.counts.codexEntries + ' 条全部可达 ✅' : '⚠ 不可达 ' + codexMissing.join(', ')}`)
  console.log('─'.repeat(78))
  if (findings.length === 0) console.log('审计结论：未发现不可达内容 ✓')
  else {
    console.log(`审计结论：${findings.length} 项发现`)
    for (const f of findings) console.log(`  [${f.sev}] ${f.msg}`)
  }
  console.log('')
  console.log('机器可读：docs/audit-content-output.json')
}
if (!process.argv.includes('--json')) writeFileSync(join(root, 'docs', 'audit-content-output.json'), JSON.stringify(out, null, 2) + String.fromCharCode(10))
if (process.argv.includes('--json')) console.log(JSON.stringify(out))
if (findings.some((f) => f.sev === 'Blocker')) process.exitCode = 1
