<script setup lang="ts">
import { computed } from 'vue'
import { pickAction, store } from '../../app/store'
import { MAX_ENHANCE, itemDef } from '../../game/content'
import { enhanceCostFor } from '../../game/rules'
import { materialCount } from '../../game/state'
import ItemIcon from './ItemIcon.vue'

/**
 * v3.2 B7：强化列表此前按行囊顺序平铺（找可强化件费眼，测评 B-C3）。
 * 现在：**未满级优先**（同级按档位降序），并给出"当前材料够强化几次"。
 */
const rows = computed(() =>
  store.state.equipment
    .map((inst) => {
      const max = inst.enhanceLevel >= MAX_ENHANCE
      // 材料够几次（下一档的成本；满级不计算）
      let afford = 0
      if (!max) {
        const cost = enhanceCostFor(inst.itemId, inst.enhanceLevel + 1)
        afford = cost.reduce((min, c) => Math.min(min, Math.floor(materialCount(store.state, c.itemId) / c.qty)), Number.MAX_SAFE_INTEGER)
        if (!Number.isFinite(afford)) afford = 0
      }
      return {
        inst,
        name: itemDef(inst.itemId).name,
        tier: itemDef(inst.itemId).tier ?? 0,
        max,
        afford,
      }
    })
    .sort((x, y) => {
      if (x.max !== y.max) return x.max ? 1 : -1 // 未满级在前
      return y.tier - x.tier || y.inst.enhanceLevel - x.inst.enhanceLevel
    }),
)

function enhance(instanceId: number, level: number): void {
  pickAction({ kind: 'enhance', instanceId, targetLevel: level + 1 })
}
</script>

<template>
  <div class="enhance">
    <p class="hint">
      选择要强化的装备（+1 ~ +4 失败不掉级；+5 起失败降 1 级，永不销毁）。<br />
      提示：使用 <b>∞ 无限模式</b>将自动连续强化——逐级锤到 +10 或材料耗尽（降级自动跟随当前等级）。
    </p>
    <p v-if="rows.length === 0" class="hint">尚无装备，先去锻造吧。</p>
    <div v-for="r in rows" :key="r.inst.instanceId" class="row">
      <ItemIcon :item-id="r.inst.itemId" :size="22" />
      <span class="name">{{ r.name }}</span>
      <span class="lv" :class="{ hot: r.inst.enhanceLevel >= 5 }">+{{ r.inst.enhanceLevel }}</span>
      <span v-if="!r.max" class="afford" :class="{ bad: r.afford === 0 }">
        材料够 {{ r.afford }} 次
      </span>
      <button v-if="!r.max" class="btn sm" :disabled="r.afford === 0" @click="enhance(r.inst.instanceId, r.inst.enhanceLevel)">
        强化 → +{{ r.inst.enhanceLevel + 1 }}
      </button>
      <span v-else class="dim">已满级</span>
    </div>
  </div>
</template>

<style scoped>
.enhance {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 560px;
}
.hint {
  color: var(--c-text-dim);
  font-size: 12px;
  margin: 0 0 4px;
}
.row {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--c-panel-2);
  border: 1px solid var(--c-border);
  border-radius: 6px;
  padding: 8px 12px;
}
.name {
  flex: 1;
}
.afford {
  font-size: 12px;
  color: var(--c-text-dim);
  font-variant-numeric: tabular-nums;
}
.afford.bad {
  color: var(--c-danger);
}
.lv {
  color: var(--c-accent-2);
  font-weight: 600;
}
.lv.hot {
  color: var(--c-accent);
}
.dim {
  color: var(--c-text-dim);
  font-size: 12px;
}
</style>
