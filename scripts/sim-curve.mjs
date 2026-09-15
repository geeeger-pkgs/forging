// scripts/sim-curve.mjs
// v1.6：技能上限 50→100 的经验曲线候选方案对比（先模拟后定档）
// 运行：node scripts/sim-curve.mjs
function curveWith(band51, band76) {
  const m = (k) => (k <= 10 ? 1.35 : k <= 20 ? 1.18 : k <= 35 ? 1.12 : k <= 50 ? 1.09 : k <= 75 ? band51 : band76)
  const rows = []
  let p = 30
  for (let L = 1; L <= 100; L++) {
    rows.push(Math.round(p))
    p *= m(L)
  }
  const cum = (N) => {
    let s = 0
    for (let L = 1; L <= N - 1; L++) s += rows[L - 1]
    return s
  }
  return { cum50: cum(50), cum65: cum(65), cum80: cum(80), cum100: cum(100) }
}

const variants = [
  ['A (1.045 / 1.035)', 1.045, 1.035],
  ['B (1.04 / 1.03)', 1.04, 1.03],
  ['C (1.035 / 1.025)', 1.035, 1.025],
  ['D (1.03 / 1.02)', 1.03, 1.02],
]
for (const [name, a, b] of variants) {
  const r = curveWith(a, b)
  const k = (x) => (x / 10000).toFixed(1) + '万'
  console.log(
    `方案${name}：→50 ${k(r.cum50)} ｜ →65 ${k(r.cum65)}（${(r.cum65 / r.cum50).toFixed(1)}×）｜ →80 ${k(r.cum80)}（${(r.cum80 / r.cum50).toFixed(1)}×）｜ →100 ${k(r.cum100)}（${(r.cum100 / r.cum50).toFixed(1)}×）`,
  )
}

// 定档方案 D 的精确锚点（供测试锁定）
const d = curveWith(1.03, 1.02)
console.log(`[精确] D 方案：cum50=${d.cum50} cum65=${d.cum65} cum80=${d.cum80} cum100=${d.cum100}`)
