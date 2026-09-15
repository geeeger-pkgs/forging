<script setup lang="ts">
import { computed } from 'vue'
import { CONTENT } from '../../game/content'
import { colorOf, shapeOf, svgFor } from '../itemArt'

const props = defineProps<{ itemId: string; size?: number }>()

const inner = computed(() => {
  const def = props.itemId ? CONTENT.items[props.itemId] : undefined
  if (!def) return svgFor('unknown', '#8a93ad')
  return svgFor(shapeOf(props.itemId), colorOf(props.itemId, def.tier))
})

const px = computed(() => `${props.size ?? 32}px`)
</script>

<template>
  <svg class="item-icon" :width="px" :height="px" viewBox="0 0 24 24" aria-hidden="true" v-html="inner" />
</template>

<style scoped>
.item-icon {
  display: inline-block;
  vertical-align: middle;
  flex-shrink: 0;
}
</style>
