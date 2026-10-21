<div align="center">

<img src="./docs/assets/banner.svg" alt="vite-plugin-preloader" width="100%" />

**在用户点击之前，页面已经就绪** —— Vite 路由智能预加载插件

[![npm version](https://img.shields.io/npm/v/vite-plugin-preloader?style=flat-square&color=818CF8&labelColor=0B1020)](https://www.npmjs.com/package/vite-plugin-preloader)
[![npm downloads](https://img.shields.io/npm/dm/vite-plugin-preloader?style=flat-square&color=22D3EE&labelColor=0B1020)](https://www.npmjs.com/package/vite-plugin-preloader)
[![License](https://img.shields.io/badge/License-MIT-C084FC?style=flat-square&labelColor=0B1020)](./LICENSE)
[![Vite](https://img.shields.io/badge/Vite-5%20%E2%80%93%208-646CFF?style=flat-square&labelColor=0B1020&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Node](https://img.shields.io/badge/Node-%E2%89%A5%2018-5FA04E?style=flat-square&labelColor=0B1020&logo=node.js&logoColor=white)](https://nodejs.org/)

[安装](#安装) · [快速开始](#快速开始) · [配置选项](#配置选项) · [工作原理](#工作原理) · [FAQ](#faq)

</div>

## 它解决什么问题

路由懒加载把首屏做小了，代价是用户**第一次点击某个页面时**要现场下载 chunk——重型页面（报表、富文本、地图）会白屏等待。

本插件在页面空闲时提前拉取你指定的路由 chunk：

- **开发环境**：注入 `<link rel="modulepreload">`，dev server 直接管 chunk，秒级生效
- **生产构建**：在 `generateBundle` 阶段扫描 Rollup 产物匹配真实 chunk 路径（含 hash），注入 `<link rel="prefetch">`，浏览器空闲时下载、点击即用
- **零运行时依赖**，SSR 构建自动跳过，可选状态角标观察预加载进度

## 安装

```bash
pnpm add vite-plugin-preloader -D
# 或
npm install vite-plugin-preloader --save-dev
```

## 快速开始

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import preloader from 'vite-plugin-preloader'

export default defineConfig({
  plugins: [
    preloader({
      routes: ['/dashboard', '/report/detail', '/editor'],
    }),
  ],
})
```

路由组件按约定 `@/views/{path}/index.vue` 自动推断；不符合约定的路由用对象格式指定组件路径：

```typescript
preloader({
  routes: [
    '/dashboard',                                    // 自动推断 @/views/dashboard/index.vue
    { path: '/report/detail', component: 'src/views/report/DetailPage.vue', reason: '高频入口' },
  ],
  exclude: ['/404', '/login'],
})
```

含 `:param` 的动态路由会被自动过滤，避免预取无意义的参数页。

## 配置选项

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `routes` | `(string \| PreloadRoute)[]` | `[]` | 预加载路由列表；字符串按约定推断组件 |
| `delay` | `number` | `2000` | 页面加载完成后延迟多少毫秒触发（不打扰首屏） |
| `debug` | `boolean` | dev `true` / prod `false` | 调试日志与 `window.__preloaderDebug` 调试工具 |
| `showStatus` | `boolean` | `true` | 页面角落显示预加载状态提示 |
| `statusPosition` | `'bottom-right' \| 'bottom-left' \| 'top-right' \| 'top-left'` | `'bottom-right'` | 状态提示位置 |
| `exclude` | `string[]` | `[]` | 排除的路由（精确或前缀匹配） |

**`PreloadRoute` 对象格式**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `path` | `string` | 路由路径，如 `/dashboard` |
| `component` | `string` | 可选。组件文件路径，不填自动推断为 `@/views/{path}/index.vue` |
| `reason` | `string` | 可选。备注，仅用于日志显示 |
| `priority` | `number` | 可选。数字越小越优先加载，默认 `2` |

## 工作原理

1. **`configResolved`**：读取 alias / root / command，解析路由到组件文件；动态路由（`:param`）与 `exclude` 命中的路由被过滤
2. **开发模式**：`transformIndexHtml` 注入 `<link rel="modulepreload">`
3. **生产构建**：`generateBundle` 扫描 Rollup 产物，把组件匹配到真实 chunk 文件（含 hash 的最终路径），`transformIndexHtml` 注入 `<link rel="prefetch">`——不依赖猜路径，`manualChunks` 拆分也能正确匹配
4. **状态提示**：可选注入轻量运行时脚本（无任何依赖），页面加载完成 `delay` 毫秒后显示预加载进度角标，全部完成后自动消失
5. **SSR**：`apply` 钩子识别 SSR 构建，不注入客户端脚本

## FAQ

<details>
<summary><b>modulepreload 和 prefetch 有什么区别？</b></summary>

`modulepreload` 会立即下载**并解析编译**模块（dev 下让切换零等待）；`prefetch` 只在浏览器空闲时下载到缓存、优先级最低（生产下不影响首屏带宽）。插件按环境自动选择正确策略。

</details>

<details>
<summary><b>组件路径和 chunk 对不上怎么办？</b></summary>

生产构建走 `generateBundle` 产物扫描，按组件真实产物路径匹配（含 hash、`manualChunks` 拆分场景）。如果某路由始终没匹配到 chunk，开启 `debug` 查看解析日志确认 `component` 路径是否正确。

</details>

<details>
<summary><b>会拖慢首屏吗？</b></summary>

不会。`prefetch` 使用浏览器空闲时机与最低优先级；dev 的 modulepreload 也只针对你明确列出的少量路由。

</details>

<details>
<summary><b>SSR 项目能用吗？</b></summary>

客户端构建正常注入；SSR 构建（`isSsrBuild`）自动跳过，不会污染服务端产物。

</details>

## 兼容性

| 项目 | 要求 |
|------|------|
| Vite | `^5.0.0 \|\| ^6.0.0 \|\| ^7.0.0 \|\| ^8.0.0`（peer dependency） |
| Node.js | `>= 18` |
| 模块格式 | 随 Vite 项目，TypeScript 类型内置 |

## 版本历史

见 [GitHub Releases](https://github.com/ChenyCHENYU/vite-plugin-preloader/releases) 与 [提交记录](https://github.com/ChenyCHENYU/vite-plugin-preloader/commits/main)。

## 贡献

欢迎提交 [Issue](https://github.com/ChenyCHENYU/vite-plugin-preloader/issues) 与 Pull Request。

## 许可证

[MIT](./LICENSE) © 2025-present CHENY

## 作者

**CHENY** · [GitHub @ChenyCHENYU](https://github.com/ChenyCHENYU)

---

<div align="center">
  <sub>如果这个插件对你有帮助，欢迎点一个 ⭐ 让更多人看到。</sub>
</div>
