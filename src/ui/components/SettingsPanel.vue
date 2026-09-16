<script setup lang="ts">
import { computed, ref } from 'vue'
import { cmd, exportCurrent, resolveFxLevel, store } from '../../app/store'
import { clearSave, importSaveFile, saveGame } from '../../app/persist'
import { checkLoadout } from '../../game/commands'
import { totalValue } from '../../game/economy'
import { CONTENT } from '../../game/content'
import { audioStatus, cueList, playCue, unlockAudio } from '../../ui/audio'
import type { FxLevel } from '../../game/types'

const fileInput = ref<HTMLInputElement | null>(null)
const message = ref('')
const loadoutName = ref('')
const appVersion = __APP_VERSION__
/** 音频引擎状态（未就绪时给玩家一句解释，而不是静默无声） */
const audioTick = ref(0)
/** 滑杆的即时显示值：`@change`（松手才提交）时输入框自身仍要跟手 */
const shownVolume = ref<number | null>(null)

const settings = computed(() => store.state.meta.settings ?? { ...CONTENT.fx.defaults })

/** auto 档实际解析成什么（供界面显示 "自动（当前：简化）"） */
const autoResolved = computed(() => resolveFxLevel('auto'))

const audioText = computed(() => {
  void audioTick.value
  const s = audioStatus()
  if (!settings.value.sound) return '已关闭'
  if (s.ready) return '已就绪'
  return '待首次点击/按键后启用（浏览器自动播放限制）'
})

function refreshAudio(): void {
  audioTick.value += 1
}

function toggleSound(e: Event): void {
  const on = (e.target as HTMLInputElement).checked
  cmd({ type: 'setSettings', patch: { sound: on } })
  if (on) {
    unlockAudio()
    refreshAudio()
  }
}

function setVolume(e: Event): void {
  const v = Number((e.target as HTMLInputElement).value)
  shownVolume.value = v
  cmd({ type: 'setSettings', patch: { volume: v } })
}

/** v3.0 L2：实例级自动回收阈值（0 = 关闭） */
const recycleThr = computed(() => store.state.meta.autoRecyclePerfect ?? 0)
function setRecycleThr(e: Event): void {
  cmd({ type: 'setAutoRecyclePerfect', pct: Number((e.target as HTMLInputElement).value) })
}

function setFx(e: Event): void {
  const v = (e.target as HTMLSelectElement).value as FxLevel
  cmd({ type: 'setSettings', patch: { fx: v } })
}

/**
 * 试听：依次播放全部 cue（每点一次换一条，按钮文案给出当前名称），
 * 同时触发一次真实手势解锁，避免"点了没声"的困惑。
 * 用 cueList() 而非硬编码 —— 这条链以前只有测试在用（测评 Minor-9）。
 */
let previewIdx = 0
const previewName = ref('')
function preview(): void {
  unlockAudio()
  const list = cueList()
  const cue = list[previewIdx % list.length]
  previewIdx += 1
  playCue(cue.id)
  previewName.value = cue.name
  refreshAudio()
}

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
      <div class="opt-row">
        <label class="opt" for="bagthr"><span>装备回收</span></label>
        <!-- v3.0 L2：实例级自动回收（低于阈值完美度的**未装备**实例自动回收；不碰在制消耗件；离线不结算） -->
        <input
          id="bagthr"
          class="slider"
          type="range"
          min="0"
          max="100"
          step="5"
          :value="recycleThr"
          @change="setRecycleThr"
        />
        <span class="dim">{{ recycleThr === 0 ? '关闭' : `低于完美度 ${recycleThr}% 自动回收` }}</span>
      </div>
      <p class="dim">
        装备回收只处理**未装备**的实例，并会避开当前动作/队列将要消耗的装备；离线期间不结算（避免误卖）。
        遗物与徽记永不参与自动回收。行囊页的「整理」可一次性回收同原型的重复装备（同分保留高强化）。
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
      <h3>视听与手感</h3>
      <p class="dim">
        音效为程序化合成（零外部资源，不增加加载体积）。音效与特效是**两个独立开关**：
        「特效」只影响画面动效，音效仍由上方开关与音量控制。
      </p>
      <div class="opt-row">
        <label class="opt">
          <input type="checkbox" :checked="settings.sound" @change="toggleSound" />
          <span>音效</span>
        </label>
        <span class="dim status">{{ audioText }}</span>
      </div>
      <div class="opt-row">
        <label class="opt" for="vol">
          <span>音量</span>
        </label>
        <!-- @change（松手才提交）：拖一次滑杆不应触发 N 次存档写入（测评 Minor-7） -->
        <input
          id="vol"
          class="slider"
          type="range"
          min="0"
          max="100"
          step="5"
          :value="shownVolume ?? settings.volume"
          :disabled="!settings.sound"
          @input="shownVolume = Number(($event.target as HTMLInputElement).value)"
          @change="setVolume"
        />
        <span class="dim">{{ shownVolume ?? settings.volume }}</span>
        <button class="btn sm" :disabled="!settings.sound" @click="preview">
          试听{{ previewName ? ` · ${previewName}` : '' }}
        </button>
      </div>
      <div class="opt-row">
        <label class="opt" for="fxl">
          <span>特效</span>
        </label>
        <select id="fxl" class="select" :value="settings.fx" @change="setFx">
          <option value="auto">自动（跟随系统减少动效：{{ autoResolved === 'reduced' ? '简化' : '完整' }}）</option>
          <option value="full">完整（全部粒子与飘字）</option>
          <option value="reduced">简化（关闭粒子爆发与光环，保留飘字）</option>
          <option value="off">关闭（无粒子与飘字；场景动画与音效不受影响）</option>
        </select>
      </div>
      <p class="dim">
        说明：「关闭」只关闭**覆盖层**的粒子与飘字，顶部提示条、面板文字与场景动画照常（关键信息始终以文字给出，不会因关动效而丢失）；
        系统开启「减少动态效果」时，「自动」档会退化为「简化」。
      </p>
      <p class="dim">
        已知平台限制：iOS 处于**静音档**时 WebAudio 不发声（系统行为，无法绕过）；浏览器要求首次点击/按键后音效才会启用；
        页面切到后台时自动静音，回到前台恢复。
      </p>
    </section>

    <section class="card">
      <h3>关于</h3>
      <p class="dim">
        Forging v3.0 · 纯前端单机放置游戏（四技能线 / 词缀与重铸 / 符文 / 传承精通 / 远征与伙伴 / 图鉴与赛季 / 深渊回廊（层词条·连打·扫荡）/ 自动化 / 视听与手感）<br />
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
.opt-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 0;
  font-size: 13px;
}
.opt {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 62px;
  cursor: pointer;
}
.opt input[type='checkbox'] {
  accent-color: var(--c-accent, #d9a441);
  width: 15px;
  height: 15px;
  cursor: pointer;
}
.status {
  margin: 0;
}
.slider {
  flex: 0 1 180px;
  accent-color: var(--c-accent, #d9a441);
  cursor: pointer;
}
.slider:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.select {
  background: var(--c-bg-deep);
  border: 1px solid var(--c-border);
  color: var(--c-text);
  border-radius: 6px;
  padding: 4px 8px;
  font-family: var(--font);
  font-size: 13px;
  cursor: pointer;
}
</style>
