// ============================================================
// v3.4 四审：**缩放目标计算的唯一实现**（内核 / 内容校验 / 脚本共用）
// 单独成模块的原因：content.ts 与 season.ts 互相引用，放任何一边都会形成循环依赖。
// 口径：系数是 2 位小数，直接乘会有浮点尾巴（600×0.34 = 204.00000000000003 → ceil 成 205），
// 故先在整数域算：系数 ×100 取整，乘完再除。
// ============================================================

export function scaleTargets(base: readonly number[], coef: number): [number, number, number] {
  const c100 = Math.round(coef * 100)
  return base.map((t) => Math.max(1, Math.ceil((t * c100) / 100))) as [number, number, number]
}
