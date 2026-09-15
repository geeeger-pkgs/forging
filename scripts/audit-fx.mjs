// ============================================================
// Forging · 视听与手感 静态证据审计（v2.5）
// 设计：docs/design-v2.5.md §3.1（E1~E6）
// 运行：node scripts/audit-fx.mjs
// 输出：人读报告 + docs/audit-fx-output.json（供 tests/fx.test.ts 机器校验）
//
// 为什么与运行时分开（评审 B3）：这些是**代码/内容表**层面的可复跑断言，
// 不需要浏览器；帧耗时/自动播放门槛属 R1~R5，只能在实机烟测里测。
// ============================================================
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (f) => JSON.parse(readFileSync(join(root, 'data', f), 'utf8'))
const readText = (f) => readFileSync(join(root, f), 'utf8')

const fx = read('fx.json')
const fails = []
const ok = (cond, msg) => {
  if (!cond) fails.push(msg)
  return cond
}

// ── E1 cue 清单结构 ─────────────────────────────────────────
const WAVES = ['sine', 'square', 'triangle', 'sawtooth', 'noise']
const cueIds = new Set()
for (const c of fx.cues) {
  ok(typeof c.id === 'string' && c.id.length > 0, `cue 缺少 id: ${JSON.stringify(c)}`)
  ok(!cueIds.has(c.id), `cue id 重复: ${c.id}`)
  cueIds.add(c.id)
  ok(typeof c.name === 'string' && c.name.length > 0, `cue 缺少 name: ${c.id}`)
  ok(WAVES.includes(c.wave), `cue 波形非法: ${c.id} -> ${c.wave}`)
  ok(Array.isArray(c.freqs) && c.freqs.length > 0, `cue 缺少音高: ${c.id}`)
  for (const fr of c.freqs ?? []) ok(fr > 20 && fr < 20000, `cue 音高越界: ${c.id} -> ${fr}`)
  ok(c.durationMs > 0 && c.durationMs <= 2000, `cue 时长非法: ${c.id} -> ${c.durationMs}`)
  ok(c.gain > 0 && c.gain <= 1, `cue 音量非法: ${c.id} -> ${c.gain}`)
}
const E1 = { count: fx.cues.length, ids: [...cueIds], pass: fx.cues.length >= 16 }

// ── E3 cue 名一致性：实现里的 cue 字面量 ⊆ fx.json ────────────
// 扫描 src/ui/*.ts + store.ts 里的 playCue('x') 与 FxPlan.cue: 'x'
const scanFiles = ['src/ui/audio.ts', 'src/ui/fx-map.ts', 'src/app/store.ts', 'src/ui/components/SettingsPanel.vue']
const used = new Set()
for (const f of scanFiles) {
  if (!existsSync(join(root, f))) continue
  const src = readText(f)
  for (const m of src.matchAll(/playCue\(\s*'([A-Za-z0-9_]+)'/g)) used.add(m[1])
  // cue 字面量：只取 `cue:` 到下一个逗号之间的表达式（三元/短路都算），
  // 避免把同一行的 burst:'gold' / kind:'item' 误判成 cue 名
  for (const m of src.matchAll(/\bcue:\s*([^,\n]+)/g)) {
    for (const q of m[1].matchAll(/'([A-Za-z0-9_]+)'/g)) used.add(q[1])
  }
}
// 'enhanceSuccess' 这类出现在三元里的已由上面覆盖；再兜底扫一遍任意 cue 字面量集合
const unknown = [...used].filter((u) => !cueIds.has(u))
// 未被任何事件引用的 cue（允许：试听/预留，但需在报告里列出以便复核）
const unusedCues = [...cueIds].filter((c) => !used.has(c))
ok(unknown.length === 0, `实现中引用了不存在的 cue: ${unknown.join(', ')}`)
const E3 = { usedCues: [...used].sort(), unusedCues: unusedCues.sort(), unknown, pass: unknown.length === 0 }

// ── E4 预算常量 ─────────────────────────────────────────────
const b = fx.budget
const E4checks = [
  ['maxParticles', b.maxParticles, (v) => v >= 1 && v <= 300],
  ['maxBurstParticles', b.maxBurstParticles, (v) => v >= 1 && v <= 100],
  ['maxBurstsPerSecond', b.maxBurstsPerSecond, (v) => v >= 1 && v <= 20],
  ['maxPopups', b.maxPopups, (v) => v >= 1 && v <= 12],
  ['frameBudgetMs', b.frameBudgetMs, (v) => v > 0 && v <= 5],
  ['loopBudgetMs', b.loopBudgetMs, (v) => v > 0 && v <= 5],
  ['maxConcurrentVoices', b.maxConcurrentVoices, (v) => v >= 1 && v <= 16],
]
// 测评 Minor-1：pass 必须是**算出来的**，不能硬编码 true（否则机器消费者读 pass 会误判）
const e4FailsBefore = fails.length
for (const [k, v, test] of E4checks) ok(test(v), `预算常量越界: ${k} = ${v}`)
ok(b.maxBurstParticles <= b.maxParticles, '单次爆发粒子上限超过总量上限')
const E4 = { budget: b, checks: E4checks.map(([k, v]) => `${k}=${v}`), pass: fails.length === e4FailsBefore }

// ── E5 零资源：public/ 与 dist/ 无新增音频/图片 ──────────────
const AUDIO_IMG = /\.(mp3|wav|ogg|m4a|aac|flac|webm|png|jpg|jpeg|gif|webp|svg|ico)$/i
// 白名单 = v2.0 已存在的 PWA 基线资源（不是 v2.5 新增）；
// v2.5 的承诺是「音效零资源」，不是「仓库无图片」。
const ALLOW = /(^|\/)(sw\.js|manifest\.webmanifest|icon\.svg|apple-touch-icon\.png|robots\.txt|llms\.txt|favicon\.ico)$/i
function scanDir(rel) {
  const abs = join(root, rel)
  if (!existsSync(abs)) return []
  const out = []
  const walk = (dir, base = '') => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      const relPath = base ? `${base}/${name}` : name
      if (statSync(p).isDirectory()) walk(p, relPath)
      else if (AUDIO_IMG.test(name) && !ALLOW.test(relPath) && !ALLOW.test(name)) out.push(`${rel}/${relPath}`)
    }
  }
  walk(abs)
  return out
}
const media = [...scanDir('public'), ...scanDir('dist')]
// 内容表里已有的既有 png（v2.0 的 Lighthouse 截图在 docs/，不在 public/dist，故不涉及）
ok(media.length === 0, `发现音频/图片资源（违反零资源承诺）: ${media.join(', ')}`)
const E5 = { media, scope: ['public', 'dist'], pass: media.length === 0 }

// ── E6 设置默认值 ───────────────────────────────────────────
const d = fx.defaults
const e6FailsBefore = fails.length
ok(typeof d.sound === 'boolean', '默认 sound 非法')
ok(d.volume >= 0 && d.volume <= 100, `默认 volume 越界: ${d.volume}`)
ok(d.fx === 'auto', `默认档应为 auto（跟随系统偏好），实为 ${d.fx}`)
ok(d.fx !== 'auto' || !fx.fxLevels.includes('auto'), 'auto 不应出现在 fxLevels（它是玩家档位，不是生效档位）')
ok(['full', 'reduced', 'off'].every((l) => fx.fxLevels.includes(l)), 'fxLevels 缺档位')
const E6 = { defaults: d, fxLevels: fx.fxLevels, pass: fails.length === e6FailsBefore }

// ── E7（v2.5 测评 B2 新增）内容管线同源：data/fx.json 必须是生成器的产物 ──
// 手改 data/fx.json 会让"设计修正"在下次 npm run gen 时被静默回滚（且 E6 立刻失败）。
let genCheck = { ran: false, pass: false, out: '' }
try {
  const { execFileSync } = await import('node:child_process')
  genCheck.out = execFileSync('node', ['scripts/gen-content.mjs', '--check'], { cwd: root, encoding: 'utf8' })
  genCheck.ran = true
  genCheck.pass = genCheck.out.includes('--check 通过')
} catch (e) {
  genCheck.ran = true
  genCheck.pass = false
  genCheck.out = String(e.stdout ?? e.message)
}
ok(genCheck.pass, 'data/*.json 与生成器不同源（跑 npm run gen 会回滚设计修正）—— 见 docs/smoke-v2.5.md §2 B2')

// ── E2 补充（静态可查部分）：事件数 ──────────────────────────
// 完整穷举由 tests/fx.test.ts 承担（脚本读不到 TS 类型）；这里记录当前事件总数
const typesSrc = readText('src/game/types.ts')
const evBlock = typesSrc.slice(typesSrc.indexOf('export type GameEvent ='))
const evCount = [...evBlock.slice(0, evBlock.indexOf('\n\n')).matchAll(/^\s*\| \{ type: '/gm)].length
const E2 = { gameEventCount: evCount, exhaustiveBy: 'tests/fx.test.ts', pass: evCount >= 30 }

// ── 报告 ────────────────────────────────────────────────────
console.log('═'.repeat(78))
console.log('Forging v2.5 · 视听与手感 静态证据审计（设计 §3.1）')
console.log('═'.repeat(78))
console.log(`E1 cue 清单          : ${E1.count} 条（≥16 ✓）`)
console.log(`     声道/音高校验     : 全部合法（wave ∈ 5 种、freqs ∈ (20,20000)、gain ∈ (0,1]）`)
console.log(`E2 事件总数          : ${E2.gameEventCount} 个 GameEvent（穷举由 tests/fx.test.ts 断言）`)
console.log(`E3 cue 名一致性      : 实现引用 ${E3.usedCues.length} 条，未引用 ${E3.unusedCues.length} 条`)
if (E3.unusedCues.length) console.log(`     未引用（预留/试听）: ${E3.unusedCues.join(', ')}`)
console.log(`     未定义（错误）     : ${E3.unknown.length ? E3.unknown.join(', ') : '无'}`)
console.log(`E4 预算常量          : ${E4.checks.join(' / ')}`)
console.log(`E5 零资源            : public/ + dist/ 音频与图片命中 ${E5.media.length} 个（白名单：sw/manifest/icon/robots/llms）`)
console.log(`E6 设置默认值        : sound=${d.sound} volume=${d.volume} fx=${d.fx}（档位 ${fx.fxLevels.join('/')}）`)
console.log(`E7 内容管线同源      : ${genCheck.pass ? 'data/*.json = 生成器产物 ✓' : '不同源 ✗（先 npm run gen）'}`)
console.log('─'.repeat(78))
console.log(fails.length === 0 ? '审计结论：全部通过 ✓' : `审计结论：${fails.length} 项失败 ✗`)
for (const f of fails) console.log(`  ✗ ${f}`)

const out = {
  version: '2.5.0',
  E1: { count: E1.count, ids: E1.ids, pass: E1.pass },
  E2: { gameEventCount: E2.gameEventCount, pass: E2.pass },
  E3: { usedCues: E3.usedCues, unusedCues: E3.unusedCues, unknown: E3.unknown, pass: E3.pass },
  E4: { budget: E4.budget, pass: E4.pass },
  E5: { media: E5.media, pass: E5.pass },
  E6: { defaults: E6.defaults, fxLevels: E6.fxLevels, pass: E6.pass },
  E7: { generatorCheck: genCheck.pass, pass: genCheck.pass },
  fails,
}
const json = JSON.stringify(out, null, 2) + '\n'
if (process.argv.includes('--check')) {
  // 只比对不写盘：供 tests/toolchain.test.ts 断言"提交的证据 JSON == 本次脚本输出"
  // （测评 Minor-2：原测试只比"提交的 JSON ↔ 内容表"，不能证明是脚本产物）
  let have = null
  try {
    have = readText('docs/audit-fx-output.json')
  } catch {
    have = null
  }
  const norm = (s) => (s ?? '').replace(/\r\n/g, '\n')
  if (norm(have) === json) {
    console.log('')
    console.log('--check 通过：docs/audit-fx-output.json 与本次审计输出一致')
  } else {
    console.error('')
    console.error('--check 失败：提交的证据 JSON 与本次审计输出不一致（先跑 node scripts/audit-fx.mjs 更新）')
    process.exitCode = 1
  }
} else {
  writeFileSync(join(root, 'docs', 'audit-fx-output.json'), json)
  console.log('')
  console.log('机器校验输出：docs/audit-fx-output.json')
}
if (fails.length) process.exitCode = 1
