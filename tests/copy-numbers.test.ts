// ============================================================
// v3.4.5：**文案数字守卫**
// 起因（第三轮双人评审用探针证明）：把 AbyssPanel 的 "×1.3" 改成 "×1.2"，全套 512 项测试**仍是绿的**
// ——即"凡界面/产物数字都有数字级断言"当时只是口号。本文件把可机械识别的形态纳入门禁。
//
// 扫描范围：**只在 `<template>` 文本区**（不含 <script>、不含 HTML 注释、不含 `{{ }}` 插值）。
// 这样既避开"代码注释里的 v3.0"这类噪声，又能抓住玩家真正看到的硬编码数字。
// 形态：① `×N[.N]` 倍率  ② `N 天` 周期  ③ `vN.N` 版本号
// 豁免：行内含 `文案数字豁免` 注释（需写明理由）。
// ============================================================
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const uiRoot = join(process.cwd(), 'src', 'ui')

function walk(dir: string): string[] {
  const out: string[] = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...walk(p))
    else if (e.name.endsWith('.vue')) out.push(p)
  }
  return out
}

/** 取出 <template> ... </template> 的行（带原始行号），并剔除 HTML 注释与插值 */
function templateTextLines(file: string): { line: number; text: string }[] {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/)
  const out: { line: number; text: string }[] = []
  let inTpl = false
  lines.forEach((raw, i) => {
    const t = raw.trim()
    // 进入模板区（SFC 的顶层 <template>）
    if (/^<template[ >]/.test(t) && !inTpl) inTpl = true
    // 结束于 <style>（**不能**用 </template>：内层 <template v-if> 的闭合会把扫描提前掐断 ——
    // 这正是探针证明过的坑：RightPanel 里探针加了 ×1.9，守卫却没红）
    if (inTpl && /^<style[ >]/.test(t)) inTpl = false
    if (inTpl) {
      // 跳过模板内的开发注释（非玩家可见文本）
      if (raw.includes('<!--') || raw.includes('-->')) return
      // 去掉插值（值来自脚本，不算硬编码）
      out.push({ line: i + 1, text: raw.replace(/\{\{[^}]*\}\}/g, '{{}}') })
    }
  })
  return out
}

const PATTERNS: { name: string; re: RegExp }[] = [
  { name: '倍率', re: /×\s*\d+(?:\.\d+)?/g },
  { name: '周期天数', re: /\d+\s*天/g },
  { name: '版本号', re: /\bv\d+\.\d+/g },
]

describe('文案数字守卫（防硬编码；评审探针证明过这类漂移测不出来）', () => {
  it('src/ui 的模板文本里不出现硬编码的倍率 / 周期天数 / 版本号', () => {
    const offenders: string[] = []
    for (const f of walk(uiRoot)) {
      for (const { line, text } of templateTextLines(f)) {
        for (const { name, re } of PATTERNS) {
          for (const m of text.matchAll(re)) {
            offenders.push(`${f.replace(process.cwd(), '')}:${line} [${name}] ${m[0]}`)
          }
        }
      }
    }
    expect(offenders, `以下位置的数字应改为从内容表插值（或标注豁免理由）：\n${offenders.join('\n')}`).toEqual([])
  })
})
