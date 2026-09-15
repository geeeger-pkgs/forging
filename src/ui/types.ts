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
}
