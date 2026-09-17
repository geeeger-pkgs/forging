import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

/**
 * v3.3 A1：加入 vue 插件，使 SFC 组件测试可运行。
 * 注意：存在 vitest.config.ts 时**不会**合并 vite.config.ts，故插件必须在这里再声明一次。
 * 环境策略：默认仍是 node（内核测试零影响、不变慢）；组件用例在文件头用
 * `// @vitest-environment jsdom` 单独声明（Vitest 5 已移除 environmentMatchGlobs，评审已核实）。
 */
export default defineConfig({
  plugins: [vue()],
  // 与 vite.config.ts 同源的构建期常量（存在 vitest.config.ts 时不合并 vite.config.ts；
  // 组件里引用了 __APP_VERSION__，缺它挂载即 ReferenceError）
  define: {
    __APP_VERSION__: JSON.stringify('test-build'),
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    // jsdom 补桩（matchMedia / scrollIntoView）；对 node 用例无副作用（内部有 window 守卫）
    setupFiles: ['tests/setup/jsdom-polyfills.ts'],
  },
})
