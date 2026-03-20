# 🚀 vite-plugin-preloader

> 治好你的"页面加载焦虑症"——精确控制指定路由的预加载时机，在用户点击之前静默预取重型页面，让组件切换瞬间响应。

[![npm version](https://img.shields.io/npm/v/vite-plugin-preloader)](https://www.npmjs.com/package/vite-plugin-preloader)
[![Vite](https://img.shields.io/badge/Vite-5~8-646cff)](https://vitejs.dev)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

你是否经历过这样的痛苦：
- 📊 点击图表页面，转圈 3 秒才显示
- 📅 打开日历组件，echarts 慢慢加载
- 💸 用户等不及直接关闭页面

**别再让用户等待了！** 这个插件在构建阶段将路由组件映射到真实 chunk，向 HTML 注入 `<link rel="prefetch">` 标签，浏览器空闲时自动拉取目标资源；配合状态 UI 和调试工具，帮你精确控制哪些页面需要提前预取、哪些不需要。

## ⚡ 效果对比

```
❌ 没有预加载：点击 → 等待 3s → 页面显示
✅ 使用预加载：点击 → 瞬间显示（已预取到缓存）🎉
```

## 🎯 核心特性

- **🌐 浏览器原生** - 使用 `<link rel="prefetch">`，由浏览器空闲时调度，零 JS 运行时开销
- **📦 bundle 感知** - 构建时扫描 Rollup/Rolldown bundle，注入真实 chunk hash 路径，生产环境 100% 有效
- **🛡️ 防御完善** - routes 防 undefined 崩溃、动态路由参数（`:id`）自动过滤、exclude 排除支持
- **🔌 网络感知** - 检测省流模式 / 2G 网络，自动跳过状态 UI，不做无谓消耗
- **🚫 SSR 安全** - SSR 构建时自动跳过，不污染服务端
- **🎨 状态提示** - 可选的右下角进度 UI，监听 prefetch link 加载事件驱动
- **🛠️ 调试工具** - `window.__preloaderDebug` 方便在浏览器控制台检查预加载状态
- **🔷 完整类型** - TypeScript 类型定义与实现完全一致，支持 Vite 5 / 6 / 7 / 8

## 📦 安装

```bash
npm i vite-plugin-preloader -D
# or
bun add vite-plugin-preloader -D
```

## 🚀 快速配置

### 懒人模式（推荐）

```js
// vite.config.js / vite.config.ts
import preloader from 'vite-plugin-preloader'

export default defineConfig({
  plugins: [
    vue(),
    preloader({
      routes: ['/dashboard', '/charts', '/calendar']
    })
  ]
})
```

### 精细化配置

```js
preloader({
  routes: [
    { path: '/dashboard',  reason: '主页面，必须快',         priority: 1 },
    { path: '/charts',     reason: 'echarts 太重了',         priority: 2 },
    { path: '/calendar',   reason: 'fullcalendar 500KB',     priority: 3 },
    // 组件路径不在默认约定（@/views/{path}/index.vue）时手动指定
    { path: '/editor',     component: '@/pages/editor/Editor.vue', priority: 1 }
  ],
  delay: 1500,            // 状态 UI 延迟出现（ms），不影响 prefetch 时机
  debug: true,            // 开发时开启，控制台打印预加载信息
  showStatus: true,       // 右下角进度提示
  statusPosition: 'bottom-right',
  exclude: ['/login', '/404', '/403']  // 不需要预加载的路由
})
```

**就这样！** 构建后打开页面源码，你会看到：

```html
<!-- 由插件在构建时自动注入，路径为真实 chunk hash -->
<link rel="prefetch" href="/assets/Dashboard-Cx8Kfm3D.js" as="script" crossorigin data-preloader="%2Fdashboard">
<link rel="prefetch" href="/assets/Charts-DmjPl9Rb.js"    as="script" crossorigin data-preloader="%2Fcharts">
<link rel="prefetch" href="/assets/Calendar-BnmQ7rKz.js"  as="script" crossorigin data-preloader="%2Fcalendar">
```

浏览器会在空闲时自动拉取这些文件到 HTTP 缓存，用户点击路由时直接从缓存加载，无需等待。

## ⚙️ 完整配置项

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `routes` | `(string \| PreloadRoute)[]` | `[]` | 要预加载的路由列表 |
| `delay` | `number` | `2000` | 状态 UI 延迟显示时间 (ms) |
| `showStatus` | `boolean` | `true` | 是否显示右下角进度提示 |
| `statusPosition` | `StatusPosition` | `'bottom-right'` | 进度提示位置 |
| `debug` | `boolean` | 开发环境 `true` | 开启控制台调试信息 |
| `exclude` | `string[]` | `[]` | 排除的路由路径（精确或前缀匹配） |

### `PreloadRoute` 对象格式

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `path` | `string` | ✅ | 路由路径，含 `:param` 的动态路由会被自动过滤 |
| `component` | `string` | ❌ | 组件路径，不填自动推断为 `@/views/{path}/index.vue` |
| `reason` | `string` | ❌ | 备注说明，仅用于调试日志 |
| `priority` | `number` | ❌ | 优先级，数字越小 `<link>` 越靠前，默认 `2` |

### `StatusPosition` 可选值

`'bottom-right'` | `'bottom-left'` | `'top-right'` | `'top-left'`

## 💡 真实使用场景

```js
preloader({
  routes: [
    '/demo/13-calendar',          // 📅 日历组件（fullcalendar）
    '/demo/29-antv-x6-editor',    // 🎨 流程图编辑器
    '/demo/16-text-editor',       // 📝 富文本编辑器
    '/demo/33-v-table-gantt',     // 📊 甘特图组件
    '/demo/20-dragable',          // 🔄 拖拽组件
  ],
  exclude: ['/login', '/404'],
  delay: 2000,
  debug: false   // 生产关掉
})
```

## 🛠️ 调试工具

**开发环境 `debug: true` 时**，控制台自动输出：

```
🚀 vite-plugin-preloader v2
已注入 3 个 <link rel="prefetch"> 标签（浏览器原生调度）
✅ /dashboard → /assets/Dashboard-Cx8Kfm3D.js | 主页面，必须快
✅ /charts    → /assets/Charts-DmjPl9Rb.js    | echarts 太重了
⚠️  /news/detail/:id (含动态参数，已自动过滤)
```

控制台可用：

```js
window.__preloaderDebug.routes          // 查看所有预加载路由及 chunk 路径
window.__preloaderDebug.check('/charts') // 检查某路由是否已成功映射 chunk
```

## 🔍 工作原理

```
构建时（generateBundle hook）：
  1. 扫描 Rollup/Rolldown bundle → 找到每个组件的输出 chunk 文件名（含 hash）
  2. 匹配用户配置的路由 → 建立 component 路径 ↔ chunk 文件名 映射

HTML 处理时（transformIndexHtml hook）：
  3. 向 </body> 前注入 <link rel="prefetch" href="/assets/Xxx-hash.js">
  4. 可选：注入状态 UI 脚本（网络感知 + prefetch 事件监听）

运行时（浏览器）：
  5. 浏览器解析到 link 标签 → 在空闲时以低优先级 fetch chunk
  6. 用户点击路由 → Vue Router 触发 import() → 命中浏览器缓存 → 瞬间加载
```

## 🚨 注意事项

**什么页面适合预加载？**
- ✅ 用户高频访问的核心页面
- ✅ 包含大型组件库（echarts / monaco-editor / fullcalendar）的页面
- ✅ 首屏之后的核心流程页

**不建议预加载：**
- ❌ 很少访问的管理页面（浪费带宽）
- ❌ 需要权限验证的敏感页面（用 `exclude` 排除）
- ❌ 含 `:param` 的动态详情页（插件会自动过滤）

## 📋 CHANGELOG

### v2.0.0（当前）
- **[破坏性修复]** 生产环境预加载机制彻底重写：从无效的运行时 `import()` 改为构建时注入 `<link rel="prefetch">`（真实 chunk hash 路径）
- **[修复]** `configResolved(config)` 正确读取 `@` 别名和项目根目录
- **[修复]** `routes` 防 `undefined`/非数组崩溃
- **[修复]** HTML 注入位置从 `</head>` 改为 `</body>` 前
- **[修复]** 动态路由参数（`:id` 等）自动过滤，不再生成无效 chunk 路径
- **[新增]** `exclude` 选项，排除不需要预加载的路由
- **[新增]** `showStatus` / `statusPosition` 完整实现（之前仅文档声明未实现）
- **[新增]** 网络感知：省流模式 / 2G 网络下自动跳过状态 UI
- **[新增]** SSR 构建自动跳过（`isSsrBuild` 检测）
- **[升级]** peerDependencies 支持 Vite 8，移除无用的 `vue` peerDep
- **[升级]** TypeScript 类型定义与实现完全对齐

### v1.1.x（历史）
- 早期版本，使用运行时动态 `import()` 预加载方式，开创了按优先级精细化路由预加载的配置模式

