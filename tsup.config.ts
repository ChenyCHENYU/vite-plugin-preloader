// ============================================================================
// 🔧 tsup.config.ts - 构建配置
// ============================================================================

import { defineConfig } from 'tsup'

export default defineConfig({
  // 📂 入口文件
  entry: ['src/index.ts'],
  
  // 📦 输出格式：支持 CommonJS 和 ES Module
  format: ['cjs', 'esm'],
  
  // 📝 生成 TypeScript 类型定义文件
  dts: true,
  
  // 🧹 构建前清理 dist 目录
  clean: true,
  
  // 🗜️ 不压缩代码（插件代码可读性更重要）
  minify: false,
  
  // 📊 生成 source map
  sourcemap: true,
  
  // 🚫 不分包（插件通常是单文件）
  splitting: false,
  
  // 🎯 外部依赖（vite 为 peer dependency，不打包进最终文件）
  external: ['vite'],
  
  // 🏷️ 添加版权信息
  banner: {
    js: '// vite-plugin-preloader - 智能路由预加载插件'
  },
  
  // 🎨 输出文件命名
  outDir: 'dist'
})