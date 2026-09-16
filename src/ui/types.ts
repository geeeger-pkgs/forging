import type { ActionRef } from '../game/types'

/** 动作格卡片（ActionGrid 输入） */
export interface ActionCard {
  ref: ActionRef
  title: string
  icon: string
  /** 优先使用程序化 SVG 图标 */
  itemId?: string
  locked: boolean
  note: string
  /** v3.1：教程当前目标对应的卡（高亮 + 「前往」落点） */
  highlight?: boolean
}

/**
 * 锻造页分类页签。
 * 约定（v2.1）：必须覆盖 data/recipes.json 中 skill=forging 的全部分类，
 * 由 tests/content.test.ts 的「内容↔UI 覆盖」用例守护 ——
 * 历史缺陷：v1.3 新增的 jewelry 配方长期没有页签入口（10 条配方不可达）。
 */
export const FORGE_CATEGORIES = [
  { id: 'tool', label: '工具' },
  { id: 'weapon', label: '武器' },
  { id: 'armor', label: '护甲' },
  { id: 'jewelry', label: '饰品' },
  { id: 'rune', label: '符文' },
] as const

export type ForgeCategory = (typeof FORGE_CATEGORIES)[number]['id']
