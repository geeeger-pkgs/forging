// ============================================================
// 版本号一键同步（v3.7.13）
// 起因：用户两次提醒"版本号又忘了"——提交信息用了 vX.Y.Z 但 package.json 没跟上，
//       README 与审计产物也各自漂移。本脚本把四处同步变成一条命令。
//
// 用法：
//   npm run bump            → patch +1（3.7.13 → 3.7.14）
//   npm run bump -- 3.8.0   → 指定版本
//
// 做四件事：改 package.json → 同步 README「当前 **x.y.z**」→ 重跑三个审计产物
//          （version 字段随 package.json）→ 打印提交提醒
// 校验：tests/toolchain.test.ts 的「版本号同步」用例会拦住漏同步
// ============================================================
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkgPath = join(root, 'package.json')
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))

const arg = process.argv[2]
let next
if (arg) {
  if (!/^\d+\.\d+\.\d+$/.test(arg)) {
    console.error(`[bump] 版本格式应为 x.y.z（收到 "${arg}"）`)
    process.exit(1)
  }
  next = arg
} else {
  const [a, b, c] = String(pkg.version).split('.').map(Number)
  next = `${a}.${b}.${c + 1}`
}

const prev = pkg.version
pkg.version = next
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
console.log(`[bump] package.json：${prev} → ${next}`)

// README 的版本标注
const readmePath = join(root, 'README.md')
const readme = readFileSync(readmePath, 'utf8')
const patched = readme.replace(/当前 \*\*\d+\.\d+\.\d+\*\*/, `当前 **${next}**`)
if (patched !== readme) {
  writeFileSync(readmePath, patched)
  console.log(`[bump] README：版本行 → ${next}`)
} else {
  console.log('[bump] README：未找到「当前 **x.y.z**」标注（跳过）')
}

// 审计产物（version 字段读 package.json）
for (const script of ['audit-content.mjs', 'sim-audit.mjs', 'sim-season.mjs']) {
  execFileSync(process.execPath, [join(root, 'scripts', script)], { stdio: 'pipe' })
  console.log(`[bump] 已重跑 scripts/${script}（产物 version 同步）`)
}

console.log(`\n[bump] 完成：package.json / README / 审计产物 ×3 均为 ${next}`)
console.log(`[bump] 提交信息请用 v${next}；若改了数据/内容请另跑 npm run gen:check`)
