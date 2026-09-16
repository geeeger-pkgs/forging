<script setup lang="ts">
import { computed } from 'vue'
import { store } from '../../app/store'
import { itemDef, skillName } from '../../game/content'
import { fmtDur } from '../format'
import { refLabel } from '../../game/refs'

const s = computed(() => store.summary)

/** v3.2 B4 修正：统一 fmtDur（此前是 'X.X 小时 / X 分钟' 写法） */
function fmtMin(ms: number): string {
  return fmtDur(ms)
}
function close(): void {
  store.summary = null
}
</script>

<template>
  <div v-if="s" class="overlay">
    <div class="dialog">
      <h3>离线结算</h3>
      <p class="dim">离线 {{ fmtMin(s.elapsedMs) }}（计入结算 {{ fmtMin(s.countedMs) }}）</p>

      <section v-if="s.rounds.length">
        <h4>完成动作</h4>
        <div v-for="(r, i) in s.rounds" :key="i" class="row">{{ refLabel(r.ref) }} × {{ r.count }}</div>
      </section>

      <section v-if="s.seasonLevels.length || s.codexMilestones.length">
        <h4>赛季与图鉴</h4>
        <div v-if="s.seasonLevels.length" class="row">
          🗓 赛季声望等级 → {{ Math.max(...s.seasonLevels) }} 级（奖励已发放）
        </div>
        <div v-if="s.codexMilestones.length" class="row">
          📖 图鉴里程碑 {{ s.codexMilestones.map((p) => Math.round(p * 100) + '%').join('、') }}（奖励已发放）
        </div>
      </section>

      <section v-if="s.expeditions.length">
        <h4>远征</h4>
        <div v-for="(e, i) in s.expeditions" :key="i" class="row">
          {{ e.routeName }}（{{ e.hours }}h）<template v-if="e.expected">按期望结算</template><template v-else>{{ e.success ? '成功' : '保底' }}</template> · +{{ e.gold }} 金
          <span class="dim">（待领取）</span>
        </div>
      </section>

      <section v-if="s.items.length">
        <h4>获得物品</h4>
        <div v-for="it in s.items" :key="it.itemId" class="row">
          {{ itemDef(it.itemId).name }} × {{ it.qty }}
        </div>
      </section>

      <section v-if="s.xp.length">
        <h4>技能经验</h4>
        <div v-for="x in s.xp" :key="x.skill" class="row">{{ skillName(x.skill) }} +{{ x.xp.toFixed(0) }}</div>
      </section>

      <section v-if="s.levels.length">
        <h4>升级</h4>
        <div v-for="(l, i) in s.levels" :key="i" class="row">{{ skillName(l.skill) }} → Lv{{ l.level }}</div>
      </section>

      <section v-if="s.notes.length">
        <h4>提示</h4>
        <div v-for="(n, i) in s.notes" :key="i" class="row dim">{{ n }}</div>
      </section>

      <footer>
        <button class="btn primary" @click="close">确定</button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
h4 {
  margin: 12px 0 4px;
  font-size: 13px;
  color: var(--c-text-dim);
}
.row {
  font-size: 14px;
  line-height: 1.7;
}
footer {
  margin-top: 16px;
  text-align: right;
}
</style>
