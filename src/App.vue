<script setup lang="ts">
// M2 将替换为完整壳层（TopBar / NavBar / MainPanel）
</script>

<template>
  <div class="boot">
    <h1>Forging</h1>
    <p>工程骨架已就绪（M1 阶段）。内容内核开发中。</p>
    <ul>
      <li>docs/03-tech-design-v0.1.md —— 技术设计（Vue 3）</li>
      <li>docs/01-game-design-v0.2.md —— 玩法设计（R2 修订版）</li>
    </ul>
  </div>
</template>

<style scoped>
.boot {
  min-height: 100vh;
  display: grid;
  place-content: center;
  text-align: center;
  gap: 8px;
}
.boot h1 {
  font-size: 28px;
  color: var(--c-accent);
  margin: 0;
}
.boot p {
  margin: 0;
  color: var(--c-text);
}
.boot ul {
  list-style: none;
  margin: 4px 0 0;
  padding: 0;
  color: var(--c-text-dim);
  font-size: 13px;
}
</style>
