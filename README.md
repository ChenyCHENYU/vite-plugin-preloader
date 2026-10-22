<div align="center">

<img src="./docs/assets/banner.svg" alt="vite-plugin-preloader" width="100%" />

**在用户点击之前，页面已经就绪** —— Vite 路由智能预加载插件

[![npm version](https://img.shields.io/npm/v/vite-plugin-preloader?style=flat-square&color=818CF8&labelColor=0B1020)](https://www.npmjs.com/package/vite-plugin-preloader)
[![npm downloads](https://img.shields.io/npm/dm/vite-plugin-preloader?style=flat-square&color=22D3EE&labelColor=0B1020)](https://www.npmjs.com/package/vite-plugin-preloader)
[![CI](https://img.shields.io/github/actions/workflow/status/ChenyCHENYU/vite-plugin-preloader/ci.yml?branch=main&style=flat-square&labelColor=0B1020)](https://github.com/ChenyCHENYU/vite-plugin-preloader/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/License-MIT-C084FC?style=flat-square&labelColor=0B1020)](./LICENSE)
[![Vite](https://img.shields.io/badge/Vite-5%20%E2%80%93%208-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Node](https://img.shields.io/badge/Node-%E2%89%A5%2020.19-5FA04E&style=flat-square&labelColor=0B1020&logo=node.js&logoColor=white)](https://nodejs.org/)

[安装](#安装) · [快速开始](#快速开始) · [配置选项](#配置选项) · [工作原理](#工作原理) · [FAQ](#faq)

</div>

## 它解决什么问题

路由懒加载把首屏做小了，代价是用户**第一次点击某个页面时**要现场下载 chunk——重型页面（报表、富文本、地图）会白屏等待。

本插件在页面空闲时提前拉取你指定的路由 chunk：

- **开发环境**：注入 `<link rel="modulepreload">`，dev server 直接管 chunk，秒级生效
- **生产构建**：在 `generateBundle` 阶段扫描产物匹配真实 chunk 路径（含 hash、含 `base`），由一段无依赖的内联脚本在页面 `load` 完成 `delay` 毫秒后注入 `<link rel="prefetch">`——浏览器空闲时下载、点击即用
- **JS 与 CSS 成组预取**：路由组件引入的样式产物（cssCodeSplit 拆分）随 chunk 一起预取，切换页面不再现拉样式
- **省流/2G 网络自动跳过预取**，SSR 构建自动跳过，可选状态角标观察预加载进度
- **框架无关**：Vue / React / Svelte 均可，匹配约定基于目录与扩展名，不依赖路由库

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

路由组件**多数情况不用写 `component`**——默认按 `@/views/{path}/index.vue` 推断，未命中时自动降级尝试目录（`views`/`pages`）× 扩展名（`vue/js/ts/jsx/tsx`）× 文件形态（`{path}/index.*`、`{path}.*`）的约定组合，最后按 `/{views|pages}/{path}(/index)?` 结构在产物里兜底匹配；实在特殊的路由再用对象格式显式指定：

```typescript
preloader({
  routes: [
    '/dashboard',                                    // 智能匹配，无需写 component
    { path: '/report/detail', component: 'src/views/report/DetailPage.vue', reason: '高频入口' },
  ],
  exclude: ['/404', '/login'],
})
```

含 `:param` 的动态路由会被自动过滤，避免预取无意义的参数页。已被入口 chunk 静态依赖（浏览器本就会立即加载）的组件会自动跳过，不做无谓 prefetch。

## 配置选项

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `routes` | `(string \| PreloadRoute)[]` | `[]` | 预加载路由列表；字符串按约定推断组件 |
| `delay` | `number` | `2000` | 生产模式：页面 `load` 完成后延迟多少毫秒再发起 prefetch（省流/2G 直接跳过）；开发模式：仅延迟状态角标显示 |
| `debug` | `boolean` | dev `true` / prod `false` | 调试日志与 `window.__preloaderDebug` 调试工具 |
| `showStatus` | `boolean` | `true` | 页面角落显示预加载状态提示 |
| `statusPosition` | `'bottom-right' \| 'bottom-left' \| 'top-right' \| 'top-left'` | `'bottom-right'` | 状态提示位置 |
| `exclude` | `string[]` | `[]` | 排除的路由（精确或前缀匹配） |
| `strategy` | `'all' \| 'viewport'` | `'all'` | 生产预取策略，见下文 |

**`PreloadRoute` 对象格式**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `path` | `string` | 路由路径，如 `/dashboard` |
| `component` | `string` | 可选。组件文件路径：`'@/views/x.vue'`（别名）、`'/src/views/x.vue'`（项目根相对）或绝对路径；不填时智能匹配（推断 + 约定候选 + 结构兜底） |
| `reason` | `string` | 可选。备注，仅用于日志显示 |
| `priority` | `number` | 可选。数字越小越先预取——生产按 priority 排序后**分批注入**（每批 4 个，全部落定或 8s 超时后放行下一批），弱网不挤占连接。默认 `2` |

**两种生产预取策略（`strategy`）**：

- `'all'`（默认）：页面 `load` 完成 `delay` 毫秒后，按 priority 分批 prefetch 全部配置路由——简单可预期，适合管理后台等路由数可控的场景
- `'viewport'`：只预取**视口内或即将点击**的 `<a href>` 对应路由（IntersectionObserver + `pointerover` 事件委托），SPA 动态渲染的链接天然覆盖——流量友好，适合内容站/移动端 H5

## 智能匹配

不写 `component` 时按以下顺序在构建产物中定位路由 chunk（dev 同样适用）：

1. 默认推断 `@/views/{path}/index.vue`
2. 约定候选：`views`/`pages` 目录 × `{path}/index.*` 与 `{path}.*` × `vue/js/ts/jsx/tsx` 扩展名
3. 结构兜底：产物模块路径以 `/{views|pages}/{path}(/index)?` 结尾即命中

显式写的 `component` 永远优先；写错了也会被上述候选自动救回。

## 调度与观测

- **priority 分批**：生产按 priority 升序分批预取（每批 4 个路由，全部落定或 8s 超时后放行下一批），弱网不挤占连接；同 priority 时小 chunk 优先，更快的进入缓存
- **命中率观测**（debug 开启时）：控制台可用 `window.__preloaderDebug.stats()` 查看 `{ prefetched, hits, misses }`——预取完成数、点击时命中/未命中计数，用它验证路由清单选得准不准
- **防御**：路由超过 12 个时 debug 日志会警告（浏览器 prefetch 缓存有限且按 LRU 逐出，建议精简或改 `viewport` 模式）

## 与 Vite / 平台能力的分工

| 能力 | 归属 | 说明 |
|------|------|------|
| 入口及静态依赖的 `modulepreload` | Vite 自身（`build.modulePreload`） | 首屏必须加载的资源，Vite 已注入，本插件不重复处理 |
| 懒加载路由 chunk 的空闲预取 | **本插件** | Vite 不处理动态导入的空闲预取；SPA 内部路由切换也不适用 Speculation Rules |
| 文档级导航预取/预渲染（MPA） | [Speculation Rules API](https://developer.mozilla.org/en-US/docs/Web/API/Speculation_Rules_API) | 官方明确不支持 SPA/app-shell 客户端路由，与本插件互补不重叠 |
| 离线缓存 | PWA/Workbox 插件 | 本插件只做在线空闲预取，不碰 Service Worker |

## 工作原理

1. **`configResolved`**：读取 alias / root / base / command，解析路由到组件文件；动态路由（`:param`）与 `exclude` 命中的路由被过滤
2. **开发模式**：`transformIndexHtml` 注入 `<link rel="modulepreload">`（dev server 直接解析源文件，预热转换缓存）
3. **生产构建**：`generateBundle` 扫描产物，按「显式路径 → 约定候选 → 结构兜底」智能匹配真实 chunk 文件（含 hash、含 `base` 的最终 URL，路径经 realpath 归一，symlink/monorepo 场景不失配），并把路由数据写入一段内联脚本注入 HTML——脚本在页面 `load` 完成 `delay` 毫秒后按 `strategy` 创建 `<link rel="prefetch">`（`all` 分批 / `viewport` 视口触发），不依赖猜路径，`manualChunks` 拆分也能正确匹配
4. **省流保护**：检测到 `saveData` 或 2G/慢速网络时自动跳过预取，不消耗用户流量
5. **状态提示**：可选显示预加载进度角标（用 performance 记录初始化已完成数，不会误卡进度），全部完成后自动消失
6. **SSR**：`apply` 钩子识别 SSR 构建，不注入客户端脚本

## FAQ

<details>
<summary><b>modulepreload 和 prefetch 有什么区别？</b></summary>

`modulepreload` 会立即下载**并解析编译**模块（dev 下让切换零等待）；`prefetch` 只在浏览器空闲时下载到缓存、优先级最低（生产下不影响首屏带宽）。插件按环境自动选择正确策略。

</details>

<details>
<summary><b>组件路径和 chunk 对不上怎么办？</b></summary>

生产构建会按「显式路径 → 约定候选（views/pages × 多扩展名 × 两种文件形态）→ 结构兜底」三级匹配，绝大多数项目结构零配置可命中。如果某路由始终没匹配到 chunk，开启 `debug` 查看解析日志：通常是组件不在任何约定目录下，或该组件被静态 import 而没有独立 chunk（预加载的前提是路由组件使用动态 `import()` 懒加载；已被入口静态依赖的组件会被自动跳过预取）。

</details>

<details>
<summary><b>会拖慢首屏吗？</b></summary>

不会。生产模式的 prefetch 在页面 `load` 完成 `delay` 毫秒（默认 2s）后才发起，首屏关键资源已加载完毕；检测到省流/2G 网络时直接跳过。dev 的 modulepreload 也只针对你明确列出的少量路由。

</details>

<details>
<summary><b>严格 CSP（禁内联脚本）的项目能用吗？</b></summary>

生产模式的 prefetch 注入器是一段内联 `<script>`，严格 CSP 下会被拦截——可给该脚本豁免 nonce/hash。若完全不能接受内联脚本，本插件生产模式不适用；开发模式在 `showStatus: false, debug: false` 时完全零脚本注入。

</details>

<details>
<summary><b>SSR 项目能用吗？</b></summary>

客户端构建正常注入；SSR 构建（`isSsrBuild`）自动跳过，不会污染服务端产物。

</details>

## 兼容性

| 项目 | 要求 |
|------|------|
| Vite | `^5.0.0 \|\| ^6.0.0 \|\| ^7.0.0 \|\| ^8.0.0`（peer dependency） |
| Node.js | `>= 20.19`（Vite 7/8 的最低要求；仅用 Vite 5/6 时 18 亦可） |
| 模块格式 | 随 Vite 项目，TypeScript 类型内置 |

## 版本历史

见 [CHANGELOG.md](./CHANGELOG.md)、[GitHub Releases](https://github.com/ChenyCHENYU/vite-plugin-preloader/releases) 与 [提交记录](https://github.com/ChenyCHENYU/vite-plugin-preloader/commits/main)。

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
