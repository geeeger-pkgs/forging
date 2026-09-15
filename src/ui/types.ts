import type { ActionRef } from '../game/types'

/** 动作格卡片（ActionGrid 输入） */
export interface ActionCard {
  ref: ActionRef
  title: string
  icon: string
  locked: boolean
  note: string
}
