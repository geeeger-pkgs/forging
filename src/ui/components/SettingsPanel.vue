<script setup lang="ts">
import { computed, ref } from 'vue'
import { cmd, exportCurrent, store } from '../../app/store'
import { clearSave, importSaveFile, saveGame } from '../../app/persist'
import { checkLoadout } from '../../game/commands'
import { totalValue } from '../../game/economy'
import { CONTENT } from '../../game/content'

const fileInput = ref<HTMLInputElement | null>(null)
const message = ref('')
const loadoutName = ref('')
const appVersion = __APP_VERSION__

/** 预设预检（v1.9）：应用前展示每个动作的阻塞原因 */
const loadoutIssues = computed(() => {
  const map: Record<string, { label: string; reason: string }[]> = {}
  for (const lo of store.state.meta.loadouts) map[lo.id] = checkLoadout(store.state, lo.id)
  return map
})

const stats = computed(() => {
  const s = store.state
  return {
    gold: s.gold,
    totalValue: totalValue(s),
    crafts: s.stats.totalCrafts,
    enhances: s.stats.totalEnhances,
    actions: s.stats.totalMines + s.stats.totalSmelts + s.stats.totalForges + s.stats.totalEnhances,
    prestiges: s.stats.totalPrestiges,
    runes: s.stats.totalRunesCrafted,
    days: Math.max(0, (Date.now() - s.character.createdAt) / 86400000).toFixed(1),
    queueSlots: s.queueSlots,
  }
})

function saveLoadout(): void {
  cmd({ type: 'saveLoadout', name: loadoutName.value })
  loadoutName.value = ''
  message.value = '已保存当前动作 + 队列为预设'
}

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
        <div class="kv"><span class="dim">总动作数</span><span>{{ stats.actions }}</span></div>
        <div class="kv"><span class="dim">传承次数</span><span>{{ stats.prestiges }}</span></div>
        <div class="kv"><span class="dim">符文制作</span><span>{{ stats.runes }}</span></div>
        <div class="kv"><span class="dim">旅途天数</span><span>{{ stats.days }} 天</span></div>
        <div class="kv"><span class="dim">队列位</span><span>{{ stats.queueSlots }} / {{ CONTENT.config.maxQueueSlots }}</span></div>
      </div>
    </section>

    <section class="card">
      <h3>动作预设</h3>
      <p class="dim">保存当前「执行中动作 + 队列」为一键预设（跨传承保留）；应用时非法动作自动跳过。</p>
      <p class="dim">应用前会自动预检，无法执行的动作会在此处列出缺失原因。</p>
      <div class="actions">
        <input v-model="loadoutName" class="text-input" placeholder="预设名称（可选）" maxlength="12" />
        <button class="btn" @click="saveLoadout">保存当前</button>
      </div>
      <div v-if="store.state.meta.loadouts.length === 0" class="dim">暂无预设。</div>
      <div v-for="lo in store.state.meta.loadouts" :key="lo.id" class="lo-block">
        <div class="lo-row">
          <span class="lo-name">{{ lo.name }}</span>
          <span class="dim">
            {{ lo.actions.length }} 个动作 · 可执行
            {{ lo.actions.length - (loadoutIssues[lo.id]?.length ?? 0) }}
          </span>
          <span class="spacer" />
          <button class="btn sm" @click="cmd({ type: 'applyLoadout', loadoutId: lo.id })">应用</button>
          <button class="btn sm" @click="cmd({ type: 'deleteLoadout', loadoutId: lo.id })">删除</button>
        </div>
        <div v-if="loadoutIssues[lo.id]?.length" class="lo-issues">
          <span v-for="(iss, k) in loadoutIssues[lo.id]" :key="k" class="issue">
            ⚠ {{ iss.label }}：{{ iss.reason }}
          </span>
        </div>
      </div>
    </section>

    <section class="card">
      <h3>自动回收</h3>
      <p class="dim">
        在右侧「资源」列表点击「自动」为材料设置保留数量：超出部分将被自动卖出换金（含离线产出）。
        再次点击「自动」可关闭。
      </p>
      <p class="dim">
        建议保留：精华/煤（强化与符文常用）留 100+；任务需要的小箱/锭请谨慎开启自动；矿石类可放心全自动。
      </p>
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
        Forging v2.0 · 纯前端单机放置游戏（挖矿 / 熔炼 / 锻造 / 强化 / 传承）<br />
        参考 Milky Way Idle 的核心循环设计；离线上限 {{ CONTENT.config.offlineCapHours }} 小时（可经精通扩展）。<br />
        构建：{{ appVersion }}
      </p>
    </section>
  </div>
</template>

<style scoped>
.settings {
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-width: 640px;
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
  line-height: 1.7;
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
  align-items: center;
}
.text-input {
  flex: 1;
  max-width: 260px;
  background: var(--c-bg-deep);
  border: 1px solid var(--c-border);
  color: var(--c-text);
  border-radius: 6px;
  padding: 5px 10px;
  font-family: var(--font);
  font-size: 13px;
}
.hidden-input {
  display: none;
}
.lo-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px dashed var(--c-border);
  font-size: 13px;
}
.lo-block {
  border-bottom: 1px dashed var(--c-border);
}
.lo-block .lo-row {
  border-bottom: none;
}
.lo-issues {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 0 0 8px 2px;
}
.issue {
  color: var(--c-warn, #e8b84b);
  font-size: 12px;
  line-height: 1.6;
}
.lo-name {
  font-weight: 600;
}
.spacer {
  flex: 1;
}
</style>
