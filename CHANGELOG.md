# Changelog

## 2.3.0

- **路由关联 CSS 预取**：`cssCodeSplit` 拆分的样式产物随路由 JS chunk 成组预取（`as=style`），切换页面不再现拉样式；预取粒度统一为"路由"，全部落定才计入进度/放行下一批
- **命中率观测**：debug 开启时 `window.__preloaderDebug.stats()` 返回 `{ prefetched, hits, misses }`，量化路由清单质量；非 debug 零注入
- **体积感知排序**：同 priority 时小 chunk 优先预取（更快进入缓存）
- **防御**：路由超过 12 个时 debug 警告（浏览器 prefetch 缓存按 LRU 逐出）
- README：新增"与 Vite / 平台能力的分工"（Vite 管首屏 modulepreload、Speculation Rules 管 MPA 导航预取、PWA 管离线）与框架无关声明（Vue/React/Svelte）
- 测试升级：happy-dom 行为级测试真实执行生成的运行时脚本（分批推进/成组落定/省流跳过/viewport 委托/命中统计）

## 2.2.0

- **修复：生产构建预取完全失效**——`transformIndexHtml` 在 build 时早于本插件的 `generateBundle` 被调起，chunkPath 永远来不及填充。改为在 `generateBundle` 中直改 HTML asset（兼容 string/Uint8Array、覆盖 MPA 多入口），`transformIndexHtml` 仅服务 dev
- **修复：symlink 路径静默失配**——组件路径与 `facadeModuleId` 统一 realpath 归一（macOS `/tmp`、pnpm workspace、monorepo 场景）
- **修复：`base` 缺失**——chunkPath 拼接 `config.base`，子路径/CDN 部署不再 404
- **行为变更**：生产 prefetch 改由运行时脚本在页面 `load` + `delay` 后注入——省流/2G 真正跳过预取，`delay` 真正控制预取时机
- **三级智能匹配**：显式路径 → 约定候选（`views`/`pages` × `{path}/index.*`、`{path}.*` × `vue/js/ts/jsx/tsx`）→ 结构兜底，多数项目零配置命中
- **`strategy: 'all' | 'viewport'`**：`all`（默认）按 priority 分批（每批 4 个路由、8s 兜底放行）；`viewport` 只预取视口内/即将点击的链接（IntersectionObserver + pointerover 委托）
- **priority 真实生效**：分批调度顺序由 priority 决定
- **入口静态依赖剔除**：已被入口 chunk 静态包含（浏览器本就会立即加载）的组件自动跳过
- 状态角标竞态修复（performance 资源记录初始化已完成数）；`debug` 默认值改由 command 判定；空路由零注入；dev 注入缓存
- 清理：移除 `handleHotUpdate` 死代码、无配置的 eslint 依赖与残留 vue 依赖；`engines` 提升至 `>=20.19`；`sideEffects: false`；内嵌 JSON 转义 `<`

## 2.0.x

- 初始 v2 架构：`configResolved` 读取 alias/root、`generateBundle` 扫描 bundle、dev 注入 modulepreload
