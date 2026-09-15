<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { closeDialog, cmd, store } from '../../app/store'
import { describeAction, type ActionDesc } from '../../app/describe'
import { nextQueueSlotCost } from '../../game/commands'
import { fmtDuration, fmtPct, itemIcon } from '../icons'

const desc = computed<ActionDesc | null>(() =>
  store.ui.dialogRef ? describeAction(store.state, store.ui.dialogRef) : null,
)

const nextSlotCost = computed(() => nextQueueSlotCost(store.state))
const queueFull = computed(() => store.state.actions.queue.length >= store.state.queueSlots)

const infinite = ref(true)
const count = ref(1)
watch(
  () => store.ui.dialogRef,
  () => {
    infinite.value = true
    count.value = 1
  },
)

function iconOf(d: ActionDesc): string {
  if (d.mineYield) return itemIcon(d.mineYield.itemId)
  if (d.outputs.length > 0) return itemIcon(d.outputs[0].itemId)
  return '✨'
}

function start(mode: 'now' | 'enqueue'): void {
  const ref = store.ui.dialogRef
  if (!ref) return
  cmd({
    type: 'startAction',
    ref,
    count: infinite.value ? null : Math.max(1, Math.floor(count.value)),
    mode,
  })
  closeDialog()
}
</script>

<template>
  <div v-if="desc" class="overlay" @click.self="closeDialog">
    <div class="dialog action-dialog">
      <header>
        <span class="icon">{{ iconOf(desc) }}</span>
        <h3>{{ desc.title }}</h3>
        <button class="btn sm" @click="closeDialog">✕</button>
      </header>

      <div class="row">
        <label>需要</label>
        <span :class="{ bad: !desc.okLevel }">{{ desc.skillName }} Lv{{ desc.unlockLevel }}（当前 {{ desc.level }}）</span>
      </div>

      <div v-if="desc.mineYield" class="row">
        <label>产出</label>
        <span>{{ desc.mineYield.min }}~{{ desc.mineYield.max }} {{ desc.mineYield.name }}</span>
      </div>

      <div v-for="i in desc.inputs" :key="'in-' + i.itemId" class="row">
        <label>材料</label>
        <span :class="{ bad: !i.ok }">{{ i.have }} / {{ i.need }} {{ i.name }}</span>
      </div>

      <div v-for="o in desc.outputs" :key="'out-' + o.itemId" class="row">
        <label>产出</label>
        <span>{{ o.qty }} {{ o.name }}</span>
      </div>

      <div class="row">
        <label>经验</label>
        <span>{{ desc.xp.toFixed(1) }}<template v-if="desc.xpSuccessDoubled">（成功 ×2）</template></span>
      </div>

      <div v-for="d in desc.drops" :key="'d-' + d.itemId" class="row">
        <label>稀有</label>
        <span>{{ d.name }} ~{{ fmtPct(d.rate) }}</span>
      </div>

      <div class="row">
        <label>时长</label>
        <span>{{ fmtDuration(desc.durationMs) }}（基础 {{ fmtDuration(desc.baseTimeMs) }}）</span>
      </div>

      <div class="row">
        <label>次数</label>
        <span class="countctl">
          <button class="btn sm" :class="{ primary: infinite }" @click="infinite = true">∞ 无限</button>
          <button class="btn sm" :class="{ primary: !infinite }" @click="infinite = false">指定次数</button>
          <input v-if="!infinite" v-model.number="count" type="number" min="1" class="num" />
        </span>
      </div>

      <p v-if="desc.blockReason" class="reason bad">⚠ {{ desc.blockReason }}</p>

      <footer>
        <div class="left-actions">
          <button v-if="nextSlotCost !== null" class="btn ghost sm" @click="cmd({ type: 'buyQueueSlot' })">
            ＋队列位（{{ nextSlotCost }}💰）
          </button>
        </div>
        <div class="right-actions">
          <button class="btn" @click="closeDialog">取消</button>
          <button
            class="btn ghost"
            :disabled="!desc.canStart || queueFull"
            :title="queueFull ? '队列已满：先升级队列位或清空队列' : ''"
            @click="start('enqueue')"
          >
            加入队列
          </button>
          <button class="btn primary" :disabled="!desc.canStart" @click="start('now')">开始</button>
        </div>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.action-dialog {
  width: 440px;
}
header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
header h3 {
  flex: 1;
  margin: 0;
}
.icon {
  font-size: 22px;
}
.row {
  display: flex;
  gap: 10px;
  font-size: 13px;
  line-height: 1.9;
}
.row label {
  width: 52px;
  color: var(--c-text-dim);
  flex-shrink: 0;
}
.countctl {
  display: flex;
  align-items: center;
  gap: 6px;
}
.num {
  width: 80px;
  background: var(--c-bg-deep);
  border: 1px solid var(--c-border);
  color: var(--c-text);
  border-radius: 6px;
  padding: 4px 8px;
  font-family: var(--font);
}
.reason {
  margin: 8px 0 0;
  font-size: 13px;
}
footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-top: 14px;
}
.right-actions {
  display: flex;
  gap: 8px;
}
</style>
