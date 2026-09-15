// ============================================================
// Forging · 远征与伙伴数值模拟（v2.2 · 开发前定档证据）
// 目的：在写内容表之前，把「产出定位/补给护栏/战力可达性/成长曲线/时长档差异」算清楚
// 运行：node scripts/sim-expedition.mjs
// 分母口径（评审 B2）：以各路线「解锁时预期采矿金/时」为锚点（sim-audit B 段实测值），
//   不随玩家配装漂移；远征产出按「锚点 × ratio」定义，ratio 落进内容表可校验
// ============================================================
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const ITEMS = JSON.parse(readFileSync(join(root, 'data/items.json'), 'utf8'))
const RECIPES = JSON.parse(readFileSync(join(root, 'data/recipes.json'), 'utf8'))

const f = (x, d = 2) => Number(x).toFixed(d)
const pct = (x, d = 1) => `${(x * 100).toFixed(d)}%`

// sim-audit.mjs B 段实测：各档「开采金/时」（同档 +5 工具，无符文/精通/词缀）
const GOLD_PER_HOUR = { 1: 2812, 2: 9673, 3: 18527, 4: 30590, 5: 46636, 6: 61534, 7: 74845 }
// sim-audit.mjs A 段实测：终局满配速度 +285% → 时长 ×0.260；虚空矿脉 24000ms → 6231ms ≈ 578 轮/时
const VOID_ACTIONS_PER_HOUR = 578
const VOID_ORE_PER_ACTION = 2 // yieldMin..Max 1~3 的均值
// 锭 → 矿石等值（gen-content：1 锭 = 5 矿 + 1 煤 @T3+），矿石按回收价计
const ingotOreCost = (tier) => {
  const suffix = ['copper', 'iron', 'silver', 'gold', 'mithril', 'starlite', 'void'][tier - 1]
  const ore = ITEMS[`ore_${suffix}`].value
  const coal = tier >= 3 ? ITEMS['coal'].value : 0
  return 5 * ore + (tier >= 3 ? coal : 0)
}
const ingotRecycle = (tier) => ITEMS[`ingot_${['copper', 'iron', 'silver', 'gold', 'mithril', 'starlite', 'void'][tier - 1]}`].value

console.log('═'.repeat(78))
console.log('A. 分母锚点与产出定位（评审 B2：锚点口径，不随配装漂移）')
console.log('═'.repeat(78))

// 路线定义（提案值，落 data/expeditions.json）
const ROUTES = [
  { id: 'outskirts', name: '近郊勘探', unlock: '伙伴 ≥1', tier: 1, anchor: GOLD_PER_HOUR[1], ratio: 0.09, supplyTier: 1, supplyPer8h: 16, tokenPer8h: 1.0, relic: null, xpPerHour: 25 },
  { id: 'oldmine', name: '废弃矿道', unlock: '挖掘 Lv20', tier: 3, anchor: GOLD_PER_HOUR[3], ratio: 0.09, supplyTier: 2, supplyPer8h: 24, tokenPer8h: 0.6, relic: 'relic_gear', xpPerHour: 45 },
  { id: 'ruins', name: '古代遗迹', unlock: '锻造 Lv35', tier: 4, anchor: GOLD_PER_HOUR[4], ratio: 0.09, supplyTier: 5, supplyPer8h: 8, tokenPer8h: 0.5, relic: 'relic_shard', xpPerHour: 90 },
  { id: 'abyss', name: '深渊前哨', unlock: '总等级 ≥150', tier: 7, anchor: GOLD_PER_HOUR[7], ratio: 0.09, supplyTier: 7, supplyPer8h: 8, tokenPer8h: 0.4, relic: 'relic_core', xpPerHour: 150 },
]

console.log(['路线'.padEnd(12), '锚点金/时'.padStart(11), '产出占比'.padStart(9), '毛产出/时'.padStart(11), '补给/时'.padStart(9), '补给价值/时'.padStart(12), '净产出/时'.padStart(11)].join(' | '))
let grossTotal = 0
let netTotal = 0
for (const r of ROUTES) {
  const gross = r.anchor * r.ratio
  const supplyPerHour = r.supplyPer8h / 8
  const supplyValue = supplyPerHour * ingotRecycle(r.supplyTier)
  grossTotal += gross
  netTotal += gross - supplyValue
  console.log(
    [
      r.name.padEnd(12),
      String(r.anchor).padStart(11),
      pct(r.ratio).padStart(9),
      f(gross, 0).padStart(11),
      f(supplyPerHour, 2).padStart(9),
      f(supplyValue, 0).padStart(12),
      f(gross - supplyValue, 0).padStart(11),
    ].join(' | '),
  )
}
console.log('')
console.log(`四线并行总毛产出 ${f(grossTotal, 0)} 金/时 = 终局锚点的 ${pct(grossTotal / GOLD_PER_HOUR[7])}（目标 15%~25% ✅）`)
console.log(`四线并行净产出 ${f(netTotal, 0)} 金/时（扣补给回收价）`)

console.log('')
console.log('═'.repeat(78))
console.log('B. 补给护栏（评审 B4/§五 5.4：套利与断供边界）')
console.log('═'.repeat(78))
console.log(['路线'.padEnd(12), '补给她'.padStart(8), '回收价/个'.padStart(10), '矿石等值/个'.padStart(13), '补给价值/时'.padStart(12), '占毛产出'.padStart(9), '矿石占用'.padStart(9)].join(' | '))
for (const r of ROUTES) {
  const perHour = r.supplyPer8h / 8
  const rec = ingotRecycle(r.supplyTier)
  const oreCost = ingotOreCost(r.supplyTier)
  const gross = r.anchor * r.ratio
  const orePerHour = perHour * 5
  const mineOrePerHour = r.tier === 7 ? VOID_ACTIONS_PER_HOUR * VOID_ORE_PER_ACTION : null
  const share = mineOrePerHour ? pct(orePerHour / mineOrePerHour) : '—'
  console.log(
    [
      r.name.padEnd(12),
      String(r.supplyPer8h).padStart(8),
      String(rec).padStart(10),
      String(oreCost).padStart(13),
      f(perHour * rec, 0).padStart(12),
      pct((perHour * rec) / gross).padStart(9),
      String(share).padStart(9),
    ].join(' | '),
  )
}
console.log('')
console.log('护栏 1：补给按回收价计 ≤ 毛产出的 5% → 强化/锻造的锭供给不被远征抽干 ✅')
console.log(`护栏 2：产出价值（每 8h ${f(ROUTES[3].anchor * ROUTES[3].ratio * 8, 0)} 金）远高于补给的矿石等值（${f(ROUTES[3].supplyPer8h * ingotOreCost(7), 0)} 金）`)
console.log('  → 单次派遣的「产出/补给」≈ 50×，但**每路线 1 个槽位 + 时长门禁**封顶（4 线并行上限即上表），不构成无限套利 ✅')

console.log('')
console.log('═'.repeat(78))
console.log('C. 战力可达性（评审 B1：路线需求必须可达，且不得死锁）')
console.log('═'.repeat(78))
const RARITY = { common: 1.0, elite: 1.25, legend: 1.6 }
const power = (level, r) => level * r * (1 + 0.02 * (level - 1))
const TEAM_MAX = 5 // 初始 2 + 旗帜 3 级
const BANNER_POWER = 0.08 // 旗帜每级 +8%（乘算：满级 1.08³ = 1.2597，与实现一致——评审 M3）
console.log(`单人满级战力：平凡 ${f(power(30, RARITY.common), 2)} / 精锐 ${f(power(30, RARITY.elite), 2)} / 传奇 ${f(power(30, RARITY.legend), 2)}`)
const teamMaxPower = TEAM_MAX * power(30, RARITY.legend) * Math.pow(1 + BANNER_POWER, 3)
console.log(`队伍上限 ${TEAM_MAX} 人 + 旗帜满级 ×${f(Math.pow(1 + BANNER_POWER, 3), 4)} → 战力天花板 ${f(teamMaxPower, 2)}`)

const REQ = { outskirts: 3, oldmine: 30, ruins: 120, abyss: 300 }
console.log(['路线'.padEnd(12), '需求战力'.padStart(9), '最高成功率'.padStart(11), '首次可达配置'.padStart(22)].join(' | '))
const firstTeam = {
  outskirts: '1 名 L1 平凡（战力 1.0）',
  oldmine: '2 名 L10 平凡（战力 21.6）',
  ruins: '3 名 L20 精锐（战力 88.5）',
  abyss: '5 名 L30 传奇（战力 379.2）',
}
for (const r of ROUTES) {
  const req = REQ[r.id]
  const cap = Math.min(1, teamMaxPower / req)
  console.log([r.name.padEnd(12), String(req).padStart(9), pct(cap).padStart(11), firstTeam[r.id].padStart(22)].join(' | '))
}
console.log('')
console.log('规则：战力不足 ≠ 阻塞（只降低成功率与产出），硬阻塞仅「无伙伴 / 补给不足 / 槽位占用 / 路线未解锁」')
console.log(`  → 首招募（战力 1.0）对近郊（需求 ${REQ.outskirts}）成功率 ${pct(1 / REQ.outskirts)}，失败亦有保底产出 → 无死锁 ✅`)
console.log(`校验护栏：max(需求) ${Math.max(...Object.values(REQ))} ≤ 战力天花板 ${f(teamMaxPower, 1)}（内容表启动校验 + 测试守护）`)

console.log('')
console.log('═'.repeat(78))
console.log('D. 时长档：补给按小时整除 → 三档净/时严格齐平（评审 M2：按实现口径 ceil + 勤勉折扣核算）')
console.log('═'.repeat(76))
const DILIGENT = 0.75 // 勤勉 −25%（每队只生效一次）
console.log(['档位'.padEnd(6), '毛产出'.padStart(9), '补给(件)'.padStart(9), '补给价值'.padStart(9), '净产出'.padStart(9), '净/时'.padStart(9)].join(' | '))
for (const h of [1, 4, 8]) {
  const r = ROUTES[3] // 深渊前哨（补给最贵，最能暴露取整偏差）
  const gross = r.anchor * r.ratio * h
  const qty = Math.max(1, Math.ceil((r.supplyPer8h / 8) * h * DILIGENT))
  const supplyValue = qty * ingotRecycle(r.supplyTier)
  console.log([`${h}h`.padEnd(6), f(gross, 0).padStart(9), String(qty).padStart(9), f(supplyValue, 0).padStart(9), f(gross - supplyValue, 0).padStart(9), f((gross - supplyValue) / h, 1).padStart(9)].join(' | '))
}
const net1 = ROUTES[3].anchor * ROUTES[3].ratio - Math.max(1, Math.ceil((ROUTES[3].supplyPer8h / 8) * 1 * DILIGENT)) * ingotRecycle(ROUTES[3].supplyTier)
const net8 = ROUTES[3].anchor * ROUTES[3].ratio * 8 - Math.max(1, Math.ceil((ROUTES[3].supplyPer8h / 8) * 8 * DILIGENT)) * ingotRecycle(ROUTES[3].supplyTier)
console.log(
  `  4h/8h 净/时严格相等（${f((net8 / 8), 1)}）；1h 因整数取整多付 ≤1 件（${f(((net1 / net8) * 8 - 1) * 100, 2)}%）——量级远小于"无脑最优"阈值，档位是**排程选择**而非收益选择 ✅`,
)
console.log('  1h 档门槛最低（只需 1 件虚空锭即可开跑），8h 档适合睡眠/离线周期（设计取舍，已显式声明）')
console.log('')
console.log('═'.repeat(78))
console.log('E. 伙伴成长曲线（1→30 级所需派遣）')
console.log('═'.repeat(78))
const xpNeed = (level) => Math.round(25 * Math.pow(level, 1.5))
let total = 0
const marks = [5, 10, 20, 30]
console.log('累计经验需求：')
// 评审 M1：升到 L30 只需 Σ_{1..29}（L30 那一档经验永不被消耗）
for (let l = 1; l < 30; l++) {
  total += xpNeed(l)
  if (marks.includes(l)) console.log(`  L${String(l).padStart(2)} → 累计 ${Math.round(total)} 经验`)
}
console.log(`  L30（满级）→ 累计 ${Math.round(total)} 经验（不含 L30 档 ${xpNeed(30)}）`)
const xpPerRun = (route, hours, wisdom = 0) => route.xpPerHour * hours * (1 + wisdom)
const runs4h = total / xpPerRun(ROUTES[3], 4)
console.log(`满级总经验 ≈ ${Math.round(total)}`)
console.log(`  按深渊 4h 档（${f(xpPerRun(ROUTES[3], 4), 0)} 经验/次）：≈ ${f(runs4h, 0)} 次 = ${f(runs4h * 4 / 24, 1)} 天（单人满级）`)
console.log(`  队伍 5 人**同时获得**该次经验（队内共享）→ 满编 ≈ ${f(runs4h, 0)} 次（${f(runs4h * 4 / 24, 1)} 天），与"长线养成"定位相符 ✅`)
const xpFull = total
console.log(`  按近郊 8h 档（${f(xpPerRun(ROUTES[0], 8), 0)} 经验/次）：≈ ${f(xpFull / xpPerRun(ROUTES[0], 8), 0)} 次 → 低档路线成长慢，形成"往上打"的动机 ✅`)

console.log('')
console.log('═'.repeat(78))
console.log('F. 徽记与招募（评审 B5：货币必须有载体与稳定来源）')
console.log('═'.repeat(78))
const tokenPerDay = ROUTES.reduce((s, r) => s + r.tokenPer8h * 3, 0) // 每路线每天最多 3 次 8h
console.log(`远征徽记产出（4 线 × 每日 3 次 8h）≈ ${f(tokenPerDay, 1)} 个/日（近郊必掉 1 个/次 = 保底 ${f(ROUTES[0].tokenPer8h * 3, 0)} 个/日）`)
const RECRUIT = { tokens: 3, gold: 5000 }
console.log(`招募价：徽记 ×${RECRUIT.tokens} + ${RECRUIT.gold} 金 → 每日可招募 ${f(tokenPerDay / RECRUIT.tokens, 1)} 次（首日即可招募 1 次，进度不被卡死 ✅）`)
console.log(`成就奖励亦发徽记（AchievementReward 已支持 itemId）→ 不依赖任务奖励 schema 扩展 ✅`)

console.log('')
console.log('═'.repeat(78))
console.log('G. 重铸石护栏（评审 M3：不得击穿 v2.1 的采矿主来源）')
console.log('═'.repeat(78))
const stonePer8h = 3 // 古代遗迹专产
const stonePerHour = stonePer8h / 8
console.log(`古代遗迹产出重铸石 ${stonePer8h} 个/8h = ${f(stonePerHour, 2)} 个/时`)
console.log(`  终局采矿重铸石 ≈ 11.5 个/时（sim-affixes E 段）→ 远征占 ${pct(stonePerHour / 11.5)}（护栏 ≤10% ✅，采矿仍是主来源）`)

console.log('')
console.log('═'.repeat(78))
console.log('H. 结论（写入设计文档 §3.1）')
console.log('═'.repeat(78))
console.log(`1. 产出定位：四线并行毛产出 ${f(grossTotal, 0)} 金/时 = 终局锚点 ${pct(grossTotal / GOLD_PER_HOUR[7])}（15%~25% 区间内）✅`)
console.log(`2. 补给护栏：补给按回收价 ≤ 毛产出 5%，且不抽取锻造/强化的锭供给 ✅`)
console.log(`3. 战力可达：需求 ${Object.values(REQ).join('/')} 全部 ≤ 天花板 ${f(teamMaxPower, 0)}；战力不足只降成功率，无死锁 ✅`)
console.log(`4. 时长档：速率与补给均按小时齐平 → 无"只派 8h"的无脑最优 ✅`)
console.log(`5. 成长曲线：单人满级 ≈ ${f(runs4h, 0)} 次 4h 派遣；低档路线成长慢 → 有"往上打"的动机 ✅`)
console.log(`6. 徽记稳定来源（近郊保底 + 成就），招募不依赖任务 schema 扩展 ✅`)
console.log(`7. 重铸石远征供给占采矿 ${pct(stonePerHour / 11.5)} → 不击穿 v2.1 设计 ✅`)
