<script setup lang="ts">
import { store } from './app/store'
import ActionDialog from './ui/components/ActionDialog.vue'
import ItemDetailModal from './ui/components/ItemDetailModal.vue'
import MainPanel from './ui/components/MainPanel.vue'
import NavBar from './ui/components/NavBar.vue'
import OfflineModal from './ui/components/OfflineModal.vue'
import RightPanel from './ui/components/RightPanel.vue'
import Toasts from './ui/components/Toasts.vue'
import TopBar from './ui/components/TopBar.vue'
</script>

<template>
  <div class="app">
    <TopBar />
    <div class="body">
      <NavBar />
      <MainPanel />
      <RightPanel />
    </div>
    <ActionDialog />
    <ItemDetailModal />
    <OfflineModal v-if="store.summary" />
    <Toasts />
  </div>
</template>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  height: 100dvh;
  /* v1.9：iOS PWA 全屏安全区（刘海/底部横条） */
  padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom)
    env(safe-area-inset-left);
  box-sizing: border-box;
}
.body {
  display: flex;
  flex: 1;
  min-height: 0;
}

/* v1.8：窄屏（移动端/小窗口）纵向堆叠 */
@media (max-width: 900px) {
  .body {
    flex-direction: column;
    overflow-y: auto;
  }
}
</style>
