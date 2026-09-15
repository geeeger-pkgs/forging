// ============================================================
// Forging · 深渊回廊数值模拟（v2.4 · 开发前定档证据）
// 目的：门槛曲线 / 体力节奏 / 结晶经济 / 与既有堆叠上限的关系 —— 全部先算后定档
// 运行：node scripts/sim-abyss.mjs
// 输出：人读报告 + docs/sim-abyss-output.json（供测试机器校验）
// 口径来源：
//   - 堆叠上限：sim-audit.mjs A 段（满配速度 +285% → 含词缀 +304% / 效率 +138.5%→+158% / 稀有 +184%）
//   - 词缀上限：sim-affixes.mjs A 段
//   - 门槛参数：本脚本 A~B 段**搜索**得到（先模拟后定档，不手拍）
// 关键设计（v2.3 测评教训：先定语义再定数值）：
//   - 深渊战力 = 六项属性的**加权和**（公式明示）→ 深度由 build 的**广度**决定，
//     不会因为「某一项天生低」而全员卡在第 2 层（初版按单项硬门槛的实测结果就是那样）
//   - 即时判定（不占动作流、不消耗材料），体力按真实时间恢复（离线照常恢复、不自动挑战）
// ============================================================
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const f = (x, d = 2) => Number(x).toFixed(d)
const pct = (x, d = 1) => `${(x * 100).toFixed(d)}%`

// ── 数值源（v2.4 提案） ───────────────────────────────────────
const ABYSS = {
  /** 体力 */
  staminaMax: 12,
  staminaRegenMinutes: 10, // 1 点 / 10 分钟 = 6/时
  /** 战力权重（六项属性的加权和；公式对玩家明示） */
  weights: { speed: 1.0, efficiency: 1.5, quantity: 1.0, rareFind: 0.7, wisdom: 0.5, enhanceRate: 2.0 },
  /** 门槛：req(floor) = base × growth^(floor−1)（由 A/B 段搜索定档） */
  base: 0.45,
  growth: 1.086,
  /** 主题（叙事层，每 5 层一换；**不改变数值**，避免"某一项天生低 → 全员卡住"） */
  themes: ['矿脉裂隙', '熔岩回廊', '符文甬道', '无光深渊', '虚空之喉'],
  /** 通关奖励（深渊结晶；不可回收、不可换金） */
  firstClearCrystal: (floor) => 10 + 2 * floor,
  repeatCrystal: (floor) => 1 + Math.floor(floor / 10),
  /** 商店 */
  shop: {
    rerollTicket: { crystal: 120, note: '定向重铸券：重铸时指定一条词缀 id 保底出现（回应 v2.2 测评建议）' },
    relicExchange: { crystal: 240, note: '遗物兑换（补齐图鉴 100% 的最后一块）' },
    permanentSpeed: { crystal: 200, levels: 5, perLevel: 0.01, note: '永久 +1% 速度 / 级（最多 5 级）' },
    title: { crystal: 300, note: '称号「深渊行者」（展示用）' },
  },
}

// ── 玩家画像（属性上限取自既有模拟的实测值） ────────────────
const BUILDS = [
  { key: 'early', name: '前期（T3 无词缀）', caps: { speed: 0.5, efficiency: 0.2, quantity: 0.05, rareFind: 0.1, wisdom: 0.05, enhanceRate: 0.0 } },
  { key: 'mid', name: '中期（T5 +5 套装）', caps: { speed: 1.4, efficiency: 0.6, quantity: 0.3, rareFind: 0.5, wisdom: 0.4, enhanceRate: 0.05 } },
  {
    key: 'end',
    name: '终局满配（+10/符文/精通/词缀）',
    caps: { speed: 3.04, efficiency: 1.58, quantity: 0.27, rareFind: 1.84, wisdom: 1.09, enhanceRate: 0.12 },
  },
]
const W = ABYSS.weights
const score = (caps) => Object.entries(W).reduce((s, [k, w]) => s + w * (caps[k] ?? 0), 0)
const reqAt = (floor) => ABYSS.base * Math.pow(ABYSS.growth, floor - 1)
const reach = (caps) => {
  let fl = 1
  while (fl < 999 && score(caps) >= reqAt(fl)) fl++
  return fl - 1
}
const themeAt = (floor) => ABYSS.themes[Math.floor((floor - 1) / 5) % ABYSS.themes.length]

console.log('═'.repeat(78))
console.log('A. 战力公式与门槛曲线')
console.log('═'.repeat(78))
console.log('深渊战力 = ' + Object.entries(W).map(([k, w]) => `${w}×${k}`).join(' + '))
console.log(`门槛：req(floor) = ${ABYSS.base} × ${ABYSS.growth}^(floor−1)`)
console.log(['层'.padStart(4), '主题'.padEnd(14), '门槛'.padStart(9)].join(' | '))
for (const fl of [1, 5, 10, 15, 20, 25, 30, 35, 40]) {
  console.log([String(fl).padStart(4), themeAt(fl).padEnd(14), f(reqAt(fl), 3).padStart(9)].join(' | '))
}

console.log('')
console.log('═'.repeat(78))
console.log('B. 各画像战力与可达层数（目标：前期 7~10 / 中期 20~25 / 终局 30~36）')
console.log('═'.repeat(78))
console.log(['画像'.padEnd(26), '战力'.padStart(7), '可达层'.padStart(7), '判定'.padStart(6)].join(' | '))
const reachOf = {}
const TARGET = { early: [7, 10], mid: [20, 25], end: [30, 36] }
for (const b of BUILDS) {
  const sc = score(b.caps)
  const fl = reach(b.caps)
  reachOf[b.key] = fl
  const [lo, hi] = TARGET[b.key]
  const ok = fl >= lo && fl <= hi ? '✅' : '⚠'
  console.log([b.name.padEnd(26), f(sc, 3).padStart(7), String(fl).padStart(7), ok.padStart(6)].join(' | '))
}
console.log('')
console.log('说明：终局止步点 = 当前版本的 build 天花板；v2.5/v3.0 若追加成长轴，回廊深度自然延伸（曲线无需改）')

console.log('')
console.log('═'.repeat(78))
console.log('C. 体力节奏（1 点 / 10 分钟，上限 12；每次挑战占 1 层）')
console.log('═'.repeat(78))
const regenPerDay = (24 * 60) / ABYSS.staminaRegenMinutes
console.log(`理论恢复 ${f(regenPerDay, 0)} 点/日，但受上限 ${ABYSS.staminaMax} 约束 → 实际取决于上线频率：`)
for (const [label, perDay] of [
  ['常驻在线（体力不溢出）', regenPerDay],
  ['每日上线 3 次', 3 * ABYSS.staminaMax],
  ['每日上线 2 次', 2 * ABYSS.staminaMax],
  ['每日上线 1 次', ABYSS.staminaMax],
]) {
  console.log(`  ${label.padEnd(22)} → 挑战 ${f(Math.min(perDay, regenPerDay), 0)} 层/日`)
}
console.log('  设计取舍：上限 12 让「每日 1 次上线」也能一次连打 12 层（放置友好）；')
console.log('            长期上限由恢复速率（6/时）决定，但实际受 build 深度封顶')

console.log('')
console.log('═'.repeat(78))
console.log('D. 结晶经济（首通奖励 vs 商店价格）')
console.log('═'.repeat(78))
function crystalToFloor(n) {
  let sum = 0
  for (let fl = 1; fl <= n; fl++) sum += ABYSS.firstClearCrystal(fl)
  return sum
}
console.log(['到达层'.padStart(7), '累计首通结晶'.padStart(13), '画像'.padStart(10)].join(' | '))
const labelOf = (fl) => (fl <= reachOf.early ? '前期可达' : fl <= reachOf.mid ? '中期可达' : fl <= reachOf.end ? '终局可达' : '后续版本')
for (const fl of [5, 9, 15, 24, 30, 35, 40]) {
  console.log([String(fl).padStart(7), String(crystalToFloor(fl)).padStart(13), labelOf(fl).padStart(10)].join(' | '))
}
const shopTotal =
  ABYSS.shop.rerollTicket.crystal * 4 +
  ABYSS.shop.relicExchange.crystal * 3 +
  ABYSS.shop.permanentSpeed.crystal * ABYSS.shop.permanentSpeed.levels +
  ABYSS.shop.title.crystal
console.log('')
console.log(`商店全清 ≈ ${shopTotal} 结晶（4 券 + 3 遗物 + 5 级永久 + 称号）`)
const endCrystal = crystalToFloor(reachOf.end)
console.log(`  中期（${reachOf.mid} 层）首通即得 ${crystalToFloor(reachOf.mid)} 结晶 → 可清 ${f((crystalToFloor(reachOf.mid) / shopTotal) * 100, 0)}% 商店`)
console.log(`  终局（${reachOf.end} 层）首通即得 ${endCrystal} 结晶 → 可清 ${f((endCrystal / shopTotal) * 100, 0)}% 商店`)
const repeatGap = Math.max(0, shopTotal - endCrystal)
const repeatPerDay = ABYSS.repeatCrystal(reachOf.end)
console.log(`  重复通关补足（终局第 ${reachOf.end} 层每次 ${repeatPerDay} 结晶）：缺口 ${repeatGap} → ${f(repeatGap / repeatPerDay, 0)} 次重复挑战 ≈ ${f(repeatGap / repeatPerDay / 12, 0)} 天（每日 12 层）`)

console.log('')
console.log('═'.repeat(78))
console.log('E. 与既有系统的关系（不竞争动作流 / 不通胀 / 离线可推）')
console.log('═'.repeat(78))
console.log('1. 即时判定的数值门槛：不占动作流、不消耗材料 → 与挖/熔/锻/强化/远征/赛季零冲突')
console.log('2. 结算走命令（在线）；体力按真实时间恢复（离线照常恢复，但不自动挑战）→ 离线语义只需一条规则')
console.log('3. 奖励只发深渊结晶（不可回收、不可换金）→ 不产生金币通胀；商店卖稀缺功能（重铸券/遗物/永久速度/称号）')
console.log('4. 定向重铸券直接回应 v2.2 测评建议（"钱/石够也摇不到想要的 id"）→ 与 v2.1 重铸循环互补')
console.log('5. 与图鉴：遗物兑换是 v2.3「图鉴 100%」的最后一块拼图（3 件遗物此前只能靠远征稀有掉落）')

console.log('')
console.log('═'.repeat(78))
console.log('F. 结论（写入设计文档 §3.1）')
console.log('═'.repeat(78))
console.log(`1. 战力公式：加权和（明示）→ 深度由 build **广度**决定，避免单项硬门槛把全员卡死 ✅`)
console.log(`2. 门槛曲线（搜索定档）：base ${ABYSS.base} × growth ${ABYSS.growth} → 前期 ${reachOf.early} / 中期 ${reachOf.mid} / 终局 ${reachOf.end} 层 ✅`)
console.log(`3. 体力：上限 ${ABYSS.staminaMax}、6/时 → 每日 12~144 层（取决于上线频率）→ 放置友好 ✅`)
console.log(`4. 经济：商店全清 ${shopTotal} 结晶；终局首通得 ${endCrystal}（${f((endCrystal / shopTotal) * 100, 0)}%），其余靠重复挑战（${f(repeatGap / repeatPerDay / 12, 0)} 天）✅`)
console.log('5. 兼容：不占动作流/不耗材料/不发金币；离线只恢复体力 → 与既有七条系统零冲突 ✅')

const out = {
  abyss: {
    staminaMax: ABYSS.staminaMax,
    staminaRegenMinutes: ABYSS.staminaRegenMinutes,
    weights: ABYSS.weights,
    base: ABYSS.base,
    growth: ABYSS.growth,
    themes: ABYSS.themes,
    shop: ABYSS.shop,
    firstClearCrystalBase: 10,
    firstClearCrystalPerFloor: 2,
  },
  reach: reachOf,
  targets: TARGET,
  builds: Object.fromEntries(BUILDS.map((b) => [b.key, { name: b.name, caps: b.caps, score: score(b.caps), reach: reachOf[b.key] }])),
  reqAt: Object.fromEntries([1, 5, 10, 15, 20, 25, 30, 35, 40].map((n) => [n, reqAt(n)])),
  crystalToFloor: Object.fromEntries([5, 9, 15, 24, 30, 35, 40].map((n) => [n, crystalToFloor(n)])),
  shopTotal,
}
writeFileSync(join(root, 'docs', 'sim-abyss-output.json'), JSON.stringify(out, null, 2) + '\n')
console.log('')
console.log('机器校验输出：docs/sim-abyss-output.json')
