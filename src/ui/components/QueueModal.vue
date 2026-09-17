<script setup lang="ts">
// ============================================================
// 队列管理（v3.7.22，用户要求：队列无法调整顺序 → 补上）
// 上移 / 下移 / 置顶 / 置底：内核按 from→to 移动（moveQueueItem），
// 这里负责换算目标位与禁用态（首项不能上移/置顶，末项不能下移/置底）。
// 顶栏空间有限（窄屏只显示前几项），所以用一个独立弹窗列出**全部**队列项。
// ============================================================
import { computed } from 'vue'
import { cmd, store } from '../../app/store'
import { refLabel } from '../../game/refs'

const queue = computed(() => store.state.actions.queue)
const slots = computed(() => store.state.queueSlots)

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
      <h3>队列顺序（{{ queue.length }} / {{ slots }}）</h3>
      <p v-if="queue.length === 0" class="dim">队列为空——在动作弹窗里点「加入队列」（材料不足也能先排）。</p>
      <ol v-else class="qlist">
        <li v-for="(q, i) in queue" :key="i" class="qrow">
          <span class="idx">{{ i + 1 }}</span>
          <span class="qname">
            {{ refLabel(q.ref) }}<em v-if="q.remaining !== null">×{{ q.remaining }}</em
            ><em v-else class="dim">∞</em>
          </span>
          <span class="spacer" />
          <button class="btn sm" :disabled="i === 0" title="置顶" @click="move(i, 0)">⤒</button>
          <button class="btn sm" :disabled="i === 0" title="上移" @click="move(i, i - 1)">↑</button>
          <button class="btn sm" :disabled="i === queue.length - 1" title="下移" @click="move(i, i + 1)">
            ↓
          </button>
          <button
            class="btn sm"
            :disabled="i === queue.length - 1"
            title="置底"
            @click="move(i, queue.length - 1)"
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
  min-width: 340px;
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
