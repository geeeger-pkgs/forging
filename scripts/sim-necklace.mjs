// scripts/sim-necklace.mjs
// 饰品（项链）强化成功率数值预研：蒙特卡洛期望尝试次数
// 规则与内核一致：失败在 +5 及以上降 1 级（不低于 0）
// 运行：node scripts/sim-necklace.mjs
const RATES = [1.0, 0.9, 0.85, 0.8, 0.74, 0.66, 0.59, 0.52, 0.44, 0.36]

function sim(bonus, runs) {
  let total = 0
  for (let r = 0; r < runs; r++) {
    let lvl = 0
    let att = 0
    while (lvl < 10 && att < 100000) {
      att++
      const tgt = lvl + 1
      const p = Math.min(1, RATES[tgt - 1] + bonus)
      if (Math.random() < p) lvl++
      else if (tgt >= 5 && lvl > 0) lvl--
    }
    total += att
  }
  return total / runs
}

const runs = 60000
console.log(`基础（无项链）：期望 ${sim(0, runs).toFixed(1)} 次`)
for (const b of [0.01, 0.015, 0.02, 0.025, 0.03, 0.0375, 0.045, 0.06]) {
  console.log(`追加 +${(b * 100).toFixed(1)}% → 期望 ${sim(b, runs).toFixed(1)} 次`)
}
