// scripts/sim-runes.mjs
// v1.4 祝福符文（强化成功率增益）对 +10 期望尝试的影响
// 运行：node scripts/sim-runes.mjs
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
console.log('== 祝福符文（10 分钟限时）对 +10 期望的影响 ==')
console.log(`基线：${sim(0, runs).toFixed(1)} 次`)
for (const [name, b] of [
  ['一阶 +3%', 0.03],
  ['二阶 +5%', 0.05],
  ['三阶 +8%', 0.08],
  ['三阶 + T5 项链(+3%)', 0.11],
  ['三阶 + T5+10 项链(+4.5%)', 0.125],
]) {
  console.log(`祝福${name} → ${sim(b, runs).toFixed(1)} 次`)
}
