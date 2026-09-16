<script setup lang="ts">
import { computed, watchEffect } from 'vue'
import { resolveFxLevel, store } from './app/store'
import ActionDialog from './ui/components/ActionDialog.vue'
import FxLayer from './ui/components/FxLayer.vue'
import ItemDetailModal from './ui/components/ItemDetailModal.vue'
import MainPanel from './ui/components/MainPanel.vue'
import NavBar from './ui/components/NavBar.vue'
import OfflineModal from './ui/components/OfflineModal.vue'
import RightPanel from './ui/components/RightPanel.vue'
import Toasts from './ui/components/Toasts.vue'
import TopBar from './ui/components/TopBar.vue'
/** v2.5：把解析后的动效档位写到根节点，CSS 据此关闭过渡/动画 */
const fxLevel = computed(() => resolveFxLevel(store.state?.meta?.settings?.fx))
watchEffect(() => {
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.dataset.fx = fxLevel.value
  }
})
</script>

<template>
  <div class="app" :data-fx="fxLevel">
    <TopBar />
    <div class="body">
      <NavBar />
      <MainPanel />
      <RightPanel />
    </div>
    <!-- v2.5：全局表现层（粒子/飘字/光环）。常驻 → 任何页面都能看到即时反馈，
         且不会因组件卸载在总线上积压后"迟到重放"（测评 B1） -->
    <FxLayer />
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
    /* v3.2 修正：右栏 Tab 条改为常驻视口底部（fixed），滚动容器留出等高内边距，
       否则会遮住页面最后一行的内容（评审 Major） */
    padding-bottom: calc(60px + env(safe-area-inset-bottom, 0px));
    /* v3.6.1（评审 B-m2）：内层滚动容器滚到端点不要链到浏览器 pull-to-refresh（Android 误刷新） */
    overscroll-behavior-y: contain;
  }
}
</style>
