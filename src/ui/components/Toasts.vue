<script setup lang="ts">
import { store } from '../../app/store'

/** 类别图标：色觉障碍玩家也能区分（不依赖颜色单通道） */
const ICON: Record<string, string> = { info: '•', good: '✔', bad: '✖' }
</script>

<template>
  <div class="toasts" role="status" aria-live="polite">
    <TransitionGroup name="toast">
      <div v-for="t in store.toasts" :key="t.id" class="toast" :class="t.kind">
        <span class="ico" aria-hidden="true">{{ ICON[t.kind] }}</span>
        <span class="txt">{{ t.text }}</span>
        <span v-if="(t.count ?? 1) > 1" class="count">×{{ t.count }}</span>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toasts {
  position: fixed;
  right: 16px;
  bottom: 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  z-index: 80;
  pointer-events: none;
}
/* v3.2 评审 N5：窄屏底栏常驻视口底部，提示条要抬到它上面，否则被压住 3 秒 */
@media (max-width: 900px) {
  .toasts {
    bottom: calc(66px + env(safe-area-inset-bottom, 0px));
    left: 12px;
    right: 12px;
    align-items: flex-end;
  }
}
.toast {
  display: flex;
  align-items: center;
  gap: 7px;
  background: var(--c-panel);
  border: 1px solid var(--c-border);
  border-left: 3px solid var(--c-accent-2);
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 13px;
  max-width: 320px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.4);
}
.toast.good {
  border-left-color: var(--c-success);
}
.toast.bad {
  border-left-color: var(--c-danger);
}
.ico {
  font-size: 12px;
  line-height: 1;
}
.toast.good .ico {
  color: var(--c-success);
}
.toast.bad .ico {
  color: var(--c-danger);
}
.txt {
  flex: 1;
}
.count {
  color: var(--c-text-dim);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
/* 滑入：位移很小（≤10px），在 375px 窄屏上不引起横向溢出 */
.toast-enter-active {
  transition: opacity 0.18s ease-out, transform 0.18s ease-out;
}
.toast-leave-active {
  transition: opacity 0.24s ease-in;
  position: absolute;
  right: 0;
}
.toast-enter-from {
  opacity: 0;
  transform: translateX(10px);
}
.toast-leave-to {
  opacity: 0;
}
/* 兜底：动效关闭档位下不做任何过渡（JS 档位 + 系统偏好双保险在 theme.css） */
@media (prefers-reduced-motion: reduce) {
  .toast-enter-active,
  .toast-leave-active {
    transition: none;
  }
}
</style>
