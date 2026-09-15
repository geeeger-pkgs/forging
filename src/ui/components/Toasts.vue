<script setup lang="ts">
import { store } from '../../app/store'
</script>

<template>
  <div class="toasts">
    <div v-for="t in store.toasts" :key="t.id" class="toast" :class="t.kind">{{ t.text }}</div>
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
.toast {
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
</style>
