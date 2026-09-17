<script setup lang="ts">
// ============================================================
// 执行顺序管理（v3.7.22 创建；v3.7.23 按用户要求把**正在执行的任务**纳入调整）
//
// 作用对象是「执行序列」= [正在执行(若有), ...队列]，**位置 0 = 立刻执行**：
//   · 队列项「置顶」→ 立刻开始，原执行中的被换下、回到队列首位（保留剩余次数）；
//   · 队列首项「上移」→ 与执行中的交换（立刻开始）；
//   · 执行中的「下移/置底」→ 它进入队列，队首顶上。
// 换算与禁用态在本组件：首行禁止上移/置顶，末行禁止下移/置底。
// ============================================================
import { computed } from 'vue'
import { cmd, store } from '../../app/store'
import { refLabel } from '../../game/refs'
import type { ActiveAction } from '../../game/types'

const queue = computed(() => store.state.actions.queue)
const cur = computed(() => store.state.actions.current)
const slots = computed(() => store.state.queueSlots)

/** 执行序列：位置 0 是正在执行的（若有） */
const rows = computed<{ act: ActiveAction; running: boolean }[]>(() => {
  const out: { act: ActiveAction; running: boolean }[] = []
  if (cur.value) out.push({ act: cur.value, running: true })
  for (const q of queue.value) out.push({ act: q, running: false })
  return out
})

function move(from: number, to: number): void {
  cmd({ type: 'moveQueueItem', from, to })
}
function close(): void {
  store.ui.queueOpen = false
}
</script>

<template>
  <div v-if="store.ui.queueOpen" class="overlay" @click.self="close">
    <div class="dialog qdialog">
      <h3>执行顺序</h3>
      <p class="dim small">
        执行中：{{ cur ? refLabel(cur.ref) : '（无）' }} ｜ 队列：{{ queue.length }} / {{ slots }}
        <br />位置 1 即「立刻执行」：把队列项置顶会换下当前任务（保留其剩余次数）。
      </p>
      <p v-if="rows.length === 0" class="dim">当前没有任何动作——在动作弹窗里点「加入队列」。</p>
      <ol v-else class="qlist">
        <li v-for="(r, i) in rows" :key="i" class="qrow" :class="{ running: r.running }">
          <span class="idx">{{ i + 1 }}</span>
          <span class="qname">
            <template v-if="r.running">▶ </template>{{ refLabel(r.act.ref)
            }}<em v-if="r.act.remaining !== null">×{{ r.act.remaining }}</em
            ><em v-else class="dim">∞</em>
          </span>
          <span class="spacer" />
          <button
            class="btn sm"
            :disabled="i === 0"
            :title="i > 0 && cur ? '置顶并立即开始（换下当前任务）' : '置顶'"
            @click="move(i, 0)"
          >
            ⤒
          </button>
          <button class="btn sm" :disabled="i === 0" title="上移" @click="move(i, i - 1)">↑</button>
          <button class="btn sm" :disabled="i === rows.length - 1" title="下移" @click="move(i, i + 1)">
            ↓
          </button>
          <button
            class="btn sm"
            :disabled="i === rows.length - 1"
            title="置底"
            @click="move(i, rows.length - 1)"
          >
            ⤓
          </button>
        </li>
      </ol>
      <footer>
        <button class="btn" @click="close">关闭</button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.qdialog {
  min-width: 360px;
}
.qlist {
  list-style: none;
  margin: 8px 0 4px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 50vh;
  overflow-y: auto;
}
.qrow {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border: 1px solid var(--c-border);
  border-radius: var(--r-sm);
  background: var(--c-panel-2);
  font-size: 13px;
}
/* 正在执行的那一项：左侧金色几何条（与侧栏选中态同语言） */
.qrow.running {
  box-shadow: inset 3px 0 0 var(--c-accent);
  border-color: rgba(255, 176, 58, 0.45);
}
.idx {
  color: var(--c-text-dim);
  min-width: 16px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.qname em {
  font-style: normal;
  color: var(--c-accent-2);
  margin-left: 4px;
}
footer {
  display: flex;
  justify-content: flex-end;
  margin-top: 10px;
}
/* 窄屏：按钮行允许换行（4 个小按钮 + 名称在 390px 下会紧） */
@media (max-width: 900px) {
  .qrow {
    flex-wrap: wrap;
  }
  .qdialog {
    min-width: 0;
  }
}
</style>
