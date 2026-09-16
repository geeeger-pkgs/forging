// ============================================================
// v3.6.2：UI 打磨契约（评审 v3.6 登记项 + backlog UI 类）
// 起因：
//   · 禁用态整卡 opacity（成就 0.5 → 文本 2.26:1，玩家读不了"怎么解锁"；深渊/远征 0.75 → 3.42）
//   · 硬编码色残留（RARITY_COLOR / ActionGrid #868b9e / AbyssPanel #7f9bff）脱离 token 体系
//   · 窄屏长文本挤压折行（CodexPanel .thead / TasksPanel .row1）
//   · T1~T7 术语对新手是黑话（backlog #4）
// 断言纪律：全部"改回去必红"（探针验证）。
// ============================================================
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// ⚠️ 统一剥注释再断言：本文件首版被自己写的说明注释骗过 3 条断言（A-m3 同型问题）
const read = (p: string): string =>
  readFileSync(join(process.cwd(), ...p.split('/')), 'utf8')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

describe('v3.6.2 UI 打磨契约', () => {
  it('禁用态不再用整体 opacity（会把文字压到 AA 以下）', () => {
    expect(read('src/ui/components/AchievementsPanel.vue'), '成就卡').not.toMatch(/\.card\s*\{[^}]*opacity:\s*0\.5/)
    expect(read('src/ui/components/AbyssPanel.vue'), '深渊已购项').not.toMatch(/\.item\.owned\s*\{[^}]*opacity/)
    expect(read('src/ui/components/ExpeditionPanel.vue'), '远征锁定路线').not.toMatch(/\.route\.disabled\s*\{[^}]*opacity/)
  })

  it('禁用态改用"深底 + 可读文本"（bg-deep，对比 ≥5.9）', () => {
    expect(read('src/ui/components/AchievementsPanel.vue')).toMatch(/\.card\s*\{[^}]*background:\s*var\(--c-bg-deep\)/)
    expect(read('src/ui/components/AchievementsPanel.vue')).toMatch(/\.card\.done\s*\{[^}]*background:\s*var\(--c-panel-2\)/)
    expect(read('src/ui/components/AbyssPanel.vue')).toMatch(/\.item\.owned\s*\{[^}]*background:\s*var\(--c-bg-deep\)/)
    expect(read('src/ui/components/ExpeditionPanel.vue')).toMatch(/\.route\.disabled\s*\{[^}]*background:\s*var\(--c-bg-deep\)/)
  })

  it('硬编码色已提 token（稀有度色 / 锁定卡文字 / 深渊词条边框）', () => {
    const ex = read('src/ui/components/ExpeditionPanel.vue')
    expect(ex, 'RARITY_COLOR 用 token').toMatch(/RARITY_COLOR[\s\S]{0,260}var\(--c-text-dim\)/)
    expect(ex, 'RARITY_COLOR 不含硬编码 hex').not.toMatch(/RARITY_COLOR[\s\S]{0,260}#[0-9a-fA-F]{6}/)
    expect(read('src/ui/components/ActionGrid.vue'), '锁定卡文字').not.toContain('#868b9e')
    expect(read('src/ui/components/AbyssPanel.vue'), '词条边框').not.toContain('#7f9bff')
  })

  it('窄屏长文本换行兜底（任务头 / 任务行，且去 spacer）', () => {
    const codex = read('src/ui/components/CodexPanel.vue')
    expect(codex, '.thead 允许换行').toMatch(/\.thead\s*\{[^}]*flex-wrap:\s*wrap/)
    expect(codex, '窄屏隐藏 thead 的 spacer').toMatch(/\.thead\s+\.spacer\s*\{[^}]*display:\s*none/)
    const tasks = read('src/ui/components/TasksPanel.vue')
    expect(tasks, '.row1 允许换行').toMatch(/\.row1\s*\{[^}]*flex-wrap:\s*wrap/)
    expect(tasks, '窄屏隐藏 row1 的 spacer').toMatch(/\.row1\s+\.spacer\s*\{[^}]*display:\s*none/)
  })

  it('T 档位术语中文化（4 处玩家可见文案）', () => {
    expect(read('src/ui/components/NavBar.vue'), '教程标签').toContain('强化金档以上装备（T4+）')
    expect(read('src/ui/components/AbyssPanel.vue'), '深渊入门提示').toContain('银档以上（T3+）')
    expect(read('src/ui/components/ShopPanel.vue'), '商店文案').toContain('金档以上矿脉（T4+）')
    const idm = read('src/ui/components/ItemDetailModal.vue')
    expect(idm, '旧黑话已移除').not.toContain('仅 T1 以上装备拥有')
    expect(idm, '改为说明获取途径').toContain('锻造产出的装备才会自带词缀')
  })

  it('档位表提为共享（format.ts 提供 TIER_CN/tierLabel；RightPanel 不再本地定义）', () => {
    const fmt = read('src/ui/format.ts')
    expect(fmt, '共享 TIER_CN').toMatch(/export const TIER_CN/)
    expect(fmt, '共享 tierLabel').toMatch(/export function tierLabel/)
    expect(fmt, 'tierLabel 回退缩放').toMatch(/tierLabel\(tier: number\)[\s\S]{0,120}T\$\{tier\}/)
    expect(read('src/ui/components/RightPanel.vue'), '本地定义已移除').not.toMatch(/const TIER_CN:/)
  })
})
