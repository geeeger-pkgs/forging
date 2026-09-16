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

/**
 * 取出 <template> ... </template> 的行（带原始行号）。
 * - `text`：玩家可见文本（剥注释、把插值换成 `{{}}`）→ 第一个 pass 用
 * - `raw` ：玩家可见文本（剥注释、**保留**插值）→ 第二个 pass 用
 *   ⚠️ 第二个 pass 必须用 raw：若拿 text 去 matchAll(`{{...}}`)，插值已被换成 `{{}}`，
 *   只能匹配到空体 —— fc40ec0 的「第二 pass」就是这样空跑的（A 评审探针证明：
 *   把历史三元串 `'（墙：门槛 ×1.06…）'` 放回去，全套仍绿）。
 */
function templateTextLines(file: string): { line: number; text: string; raw: string }[] {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/)
  const out: { line: number; text: string; raw: string }[] = []
  let inTpl = false
  let inComment = false
  lines.forEach((line0, i) => {
    const t = line0.trim()
    // 进入模板区（SFC 的顶层 <template>）
    if (/^<template[ >]/.test(t) && !inTpl) inTpl = true
    // 结束于 <style>（**不能**用 </template>：内层 <template v-if> 的闭合会把扫描提前掐断 ——
    // 这正是探针证明过的坑：RightPanel 里探针加了 ×1.9，守卫却没红）
    if (inTpl && /^<style[ >]/.test(t)) inTpl = false
    if (!inTpl) return
    // 剥 HTML 注释（含跨行）。不能"整行跳过"：`<p>×1.5</p><!-- 说明 -->` 这类
    // 同行注释 + 可见文本会被整行放过（B 评审合成用例证明）。
    let visible = line0
    if (inComment) {
      const end = visible.indexOf('-->')
      if (end === -1) return
      visible = visible.slice(end + 3)
      inComment = false
    }
    for (;;) {
      const s = visible.indexOf('<!--')
      if (s === -1) break
      const e = visible.indexOf('-->', s + 4)
      if (e === -1) {
        visible = visible.slice(0, s)
        inComment = true
        break
      }
      visible = visible.slice(0, s) + visible.slice(e + 3)
    }
    if (!visible.trim()) return
    out.push({ line: i + 1, text: visible.replace(/\{\{[^}]*\}\}/g, '{{}}'), raw: visible })
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

  /**
   * v3.4.5：第二个 pass —— **插值内部的字符串字面量**。
   * 起因：AbyssPanel 曾把"（墙：门槛 ×1.06、首通结晶 ×1.5）"写在三元表达式的字符串里，
   * 上面那个 pass 会把整段 `{{ ... }}` 剥掉，于是这些玩家可见的数字**扫不到**。
   * 规则：`{{ }}` 里出现的**带引号字符串**若含 `×N` / `N 天` / `vN.N`，视为硬编码。
   */
  it('插值内的字符串字面量同样不得写死数字（防"藏在 {{ }} 里"的孔洞）', () => {
    const offenders: string[] = []
    for (const f of walk(uiRoot)) {
      // 必须用 raw（保留插值）；用 text 会得到空体，pass 空跑（探针证明过）
      for (const { line, raw } of templateTextLines(f)) {
        for (const interp of raw.matchAll(/\{\{([\s\S]*?)\}\}/g)) {
          for (const lit of interp[1].matchAll(/'([^']*)'|"([^"]*)"/g)) {
            const body = lit[1] ?? lit[2] ?? ''
            for (const { name, re } of PATTERNS) {
              for (const m of body.matchAll(re)) {
                offenders.push(`${f.replace(process.cwd(), '')}:${line} [${name}] 插值字面量 "…${m[0]}…"`)
              }
            }
          }
        }
      }
    }
    expect(offenders, `插值内的字符串字面量也要从内容表推导：\n${offenders.join('\n')}`).toEqual([])
  })
})
