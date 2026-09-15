<script setup lang="ts">
import { computed, ref } from 'vue'
import { exportCurrent, store } from '../../app/store'
import { clearSave, importSaveFile, saveGame } from '../../app/persist'
import { totalValue } from '../../game/economy'
import { CONTENT } from '../../game/content'

const fileInput = ref<HTMLInputElement | null>(null)
const message = ref('')

const stats = computed(() => ({
  gold: store.state.gold,
  totalValue: totalValue(store.state),
  crafts: store.state.stats.totalCrafts,
  enhances: store.state.stats.totalEnhances,
  days: Math.max(0, (Date.now() - store.state.character.createdAt) / 86400000).toFixed(1),
  queueSlots: store.state.queueSlots,
}))

function onExport(): void {
  exportCurrent()
  message.value = '已导出存档文件（浏览器下载目录）'
}

function pickFile(): void {
  fileInput.value?.click()
}

async function onFile(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  if (!window.confirm('导入将覆盖当前存档，确定吗？')) {
    input.value = ''
    return
  }
  const next = await importSaveFile(file)
  if (!next) {
    message.value = '导入失败：文件无效或版本不兼容'
    input.value = ''
    return
  }
  store.state = next
  saveGame(next)
  window.location.reload()
}

function onClear(): void {
  if (!window.confirm('确定清空存档并重新开始吗？此操作不可撤销！')) return
  clearSave()
  window.location.reload()
}
</script>

<template>
  <div class="settings">
    <section class="card">
      <h3>统计</h3>
      <div class="grid">
        <div class="kv"><span class="dim">金币</span><span>{{ stats.gold }}</span></div>
        <div class="kv"><span class="dim">总价值</span><span>{{ stats.totalValue }}</span></div>
        <div class="kv"><span class="dim">累计制作</span><span>{{ stats.crafts }}</span></div>
        <div class="kv"><span class="dim">累计强化</span><span>{{ stats.enhances }}</span></div>
        <div class="kv"><span class="dim">旅途天数</span><span>{{ stats.days }} 天</span></div>
        <div class="kv"><span class="dim">队列位</span><span>{{ stats.queueSlots }} / {{ CONTENT.config.maxQueueSlots }}</span></div>
      </div>
    </section>

    <section class="card">
      <h3>存档</h3>
      <p class="dim">
        自动保存：每 {{ CONTENT.config.autosaveSec }} 秒 + 每次操作（含双槽备份，损坏时自动回退）。
      </p>
      <div class="actions">
        <button class="btn" @click="onExport">导出存档</button>
        <button class="btn" @click="pickFile">导入存档</button>
        <button class="btn danger" @click="onClear">清档重来</button>
        <input ref="fileInput" type="file" accept="application/json" class="hidden-input" @change="onFile" />
      </div>
      <p v-if="message" class="dim">{{ message }}</p>
    </section>

    <section class="card">
      <h3>关于</h3>
      <p class="dim">
        Forging v0.1.0 · 纯前端单机放置游戏（挖矿 / 熔炼 / 锻造 / 强化）<br />
        参考 Milky Way Idle 的核心循环设计；离线结算上限 {{ CONTENT.config.offlineCapHours }} 小时。
      </p>
    </section>
  </div>
</template>

<style scoped>
.settings {
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-width: 620px;
}
.card {
  background: var(--c-panel-2);
  border: 1px solid var(--c-border);
  border-radius: var(--radius);
  padding: 14px 16px;
}
.card h3 {
  margin: 0 0 8px;
  font-size: 15px;
}
.dim {
  color: var(--c-text-dim);
  font-size: 13px;
  margin: 4px 0;
}
.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px 24px;
}
.kv {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  padding: 3px 0;
}
.actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}
.hidden-input {
  display: none;
}
</style>
