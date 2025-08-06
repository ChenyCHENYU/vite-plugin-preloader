# 🚀 vite-plugin-preloader

智能路由预加载 Vite 插件，一行配置，极致性能！

## ✨ 特性

- 🎯 **一行配置** - 在 `vite.config.js` 中配置即可，无需修改任何业务代码
- ⚡ **零运行时开销** - 构建时生成，运行时高效执行
- 🎨 **自动注入** - 无需手动调用，插件自动将预加载脚本注入 HTML
- 🛠️ **开发友好** - 智能默认配置 + 丰富的调试工具
- 📦 **类型安全** - 完整的 TypeScript 支持
- 🔥 **热更新支持** - 配置变更时自动更新
- 🎭 **状态可视化** - 优雅的加载状态显示，支持多种位置

## 📦 安装

```bash
npm install vite-plugin-preloader
# 或
yarn add vite-plugin-preloader
# 或
pnpm add vite-plugin-preloader
# 或
bun add vite-plugin-preloader
```

## 🚀 快速开始

### 极简配置（推荐）

```js
// vite.config.js
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import preloader from 'vite-plugin-preloader'

export default defineConfig({
  plugins: [
    vue(),
    preloader({
      routes: [
        '/dashboard',    // 字符串配置，组件路径自动推断
        '/calendar',     // 推断为: @/views/calendar/index.vue
        '/charts',       // 推断为: @/views/charts/index.vue
      ]
    })
  ]
})
```

**就这样！** 插件会自动：
- 🎯 推断组件路径
- 📦 注入预加载脚本
- 🎨 显示加载状态
- 🛠️ 提供调试工具
- ⚙️ 应用智能默认配置

### 完整配置示例

```js
preloader({
  routes: [
    // 🔥 字符串配置 - 简单直接
    '/dashboard',
    '/user-profile',
    
    // 🎯 对象配置 - 更多控制
    { 
      path: '/calendar', 
      component: '@/views/calendar/CalendarView.vue', // 自定义组件路径
      reason: '日历组件包含 @fullcalendar 全家桶(~500KB)',
      priority: 1  // 高优先级，优先加载
    },
    { 
      path: '/charts', 
      reason: '图表页面包含 echarts、@antv/x6 等重型库',
      priority: 2 
    },
    { 
      path: '/reports', 
      reason: '报表页面包含复杂的数据处理逻辑',
      priority: 3 
    }
  ],
  
  // 🚀 以下所有配置都有智能默认值，可选配置
  delay: 2000,                    // 页面加载后延迟 2 秒开始预加载
  showStatus: true,               // 显示 "🔄 正在优化页面..." 状态
  statusPosition: 'bottom-right', // 状态显示位置
  debug: true                     // 强制开启调试（默认开发环境自动开启）
})
```

## 🎯 配置选项

### 插件选项

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `routes` | `(string \| PreloadRoute)[]` | `[]` | **必填** 预加载路由配置 |
| `delay` | `number` | `2000` | 延迟时间(ms)，避免影响首屏加载 |
| `showStatus` | `boolean` | `true` | 显示加载状态指示器 |
| `statusPosition` | `'top-left' \| 'top-right' \| 'bottom-left' \| 'bottom-right'` | `'bottom-right'` | 状态指示器位置 |
| `debug` | `boolean` | `开发环境: true`<br>`生产环境: false` | 调试模式，控制台输出详细日志 |

### PreloadRoute 配置

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `path` | `string` | ✅ | 路由路径，如 `/dashboard` |
| `component` | `string` | ❌ | 组件路径，不填则自动推断 |
| `reason` | `string` | ❌ | 预加载原因说明，便于调试和维护 |
| `priority` | `number` | ❌ | 优先级 1-5（数字越小越先加载），默认 2 |

## 🛠️ 开发调试

开发环境下，插件自动在浏览器控制台提供调试工具：

```js
// 查看预加载统计信息
window.preloaderDebug.stats()
// 返回: { total: 3, completed: 2, failed: 0, startTime: 1234567890, ... }

// 检查指定路由是否已预加载  
window.preloaderDebug.check('/calendar')
// 返回: true

// 手动重新开始预加载（用于测试）
window.preloaderDebug.restart()

// 显示所有可用的调试命令
window.preloaderDebug.help()
```

## 📊 控制台输出示例

### 插件启动日志
```
🚀 [预加载插件] 已启用，配置了 3 个路由
📋 [预加载插件] 路由列表: ["/dashboard", "/calendar", "/charts"]
⚙️ [预加载插件] 配置选项: { delay: 2000, showStatus: true, statusPosition: "bottom-right", debug: true }
🎨 [预加载插件] 注入预加载脚本到 HTML
```

### 预加载执行日志
```
🚀 [预加载] 开始预加载 3 个页面
✅ [预加载] /dashboard (156ms) - 自动推断的预加载页面
✅ [预加载] /calendar (234ms) - 日历组件包含 @fullcalendar 全家桶(~500KB)
✅ [预加载] /charts (456ms) - 图表页面包含 echarts、@antv/x6 等重型库
🎉 [预加载] 完成! 耗时 1234ms
🛠️ 预加载调试工具: window.preloaderDebug
```

## 🎨 状态显示效果

插件会在页面显示优雅的加载状态：

```
🔄 正在优化页面... 2/3
```

- **位置可配置**：四个角落任选
- **自动隐藏**：预加载完成后淡出消失
- **不干扰用户**：`pointer-events: none`，不阻挡交互

## 🔧 最佳实践

### 1. 路由配置策略

```js
routes: [
  // 🔥 核心页面 - 用户必访，优先级最高
  { path: '/dashboard', priority: 1, reason: '用户首页，访问频率最高' },
  
  // ⚡ 常用页面 - 功能页面，中等优先级
  { path: '/calendar', priority: 2, reason: '日历功能，包含大型日期库' },
  { path: '/contacts', priority: 2, reason: '联系人管理，数据量大' },
  
  // 📊 专业工具 - 低频但重型，最后加载
  { path: '/reports', priority: 3, reason: '报表页面，包含复杂图表库' },
  { path: '/admin', priority: 3, reason: '管理后台，权限要求高' }
]
```

### 2. 智能路径推断

插件自动将路由路径转换为组件路径：

```js
// 路径推断规则
'/dashboard'           → '@/views/dashboard/index.vue'
'/user-profile'        → '@/views/user-profile/index.vue'
'/admin/users'         → '@/views/admin/users/index.vue'
'/demo/13-calendar'    → '@/views/demo/13-calendar/index.vue'
```

### 3. 性能优化建议

```js
{
  // ✅ 推荐：给出明确的预加载原因
  path: '/calendar',
  reason: '日历组件包含 @fullcalendar(~400KB) + moment.js(~60KB)',
  priority: 2
},

{
  // ✅ 推荐：重型页面单独配置优先级
  path: '/data-visualization', 
  reason: '数据可视化包含 d3.js + echarts + three.js (~1.2MB)',
  priority: 3  // 低优先级，避免影响关键页面
}
```

### 4. 开发环境优化

```js
// vite.config.js
preloader({
  routes: [/* ... */],
  
  // 开发环境配置
  ...(process.env.NODE_ENV === 'development' ? {
    debug: true,        // 开发环境显示详细日志
    delay: 1000,        // 开发环境快速启动
    showStatus: true    // 显示状态便于调试
  } : {
    debug: false,       // 生产环境静默运行
    delay: 3000,        // 生产环境延迟更久，确保首屏稳定
    showStatus: false   // 生产环境不显示状态
  })
})
```

## 🚀 工作原理

### 构建时
1. **配置解析** - 解析用户配置，应用智能默认值
2. **路径推断** - 自动推断未指定的组件路径
3. **代码生成** - 生成优化的预加载脚本
4. **HTML注入** - 将脚本直接注入到 HTML `<head>` 中

### 运行时
1. **DOM就绪检测** - 等待页面 DOM 加载完成
2. **延迟启动** - 根据配置延迟指定时间后启动
3. **优先级排序** - 按 priority 值从小到大排序
4. **串行加载** - 顺序预加载，避免并发阻塞
5. **状态反馈** - 实时更新加载状态和统计信息

## 🎯 适用场景

- ✅ **Vue SPA 应用** - 单页应用路由预加载
- ✅ **后台管理系统** - 管理页面通常较重，预加载效果明显
- ✅ **数据可视化应用** - 图表库体积大，预加载能显著提升体验
- ✅ **工具型应用** - 功能页面复杂，用户操作流程相对固定

## ❓ 常见问题

### Q: 预加载会影响首屏性能吗？
A: 不会。插件默认延迟 2 秒启动，确保首屏渲染完成后才开始预加载。

### Q: 如何判断哪些页面需要预加载？
A: 建议预加载：1) 用户高频访问的页面 2) 包含大型第三方库的页面 3) 数据处理复杂的页面。

### Q: 开发环境下看不到预加载效果？
A: 开发环境下模块已经在内存中，预加载效果不明显。可以通过控制台日志确认插件正常工作。

### Q: 可以配置生产环境不预加载吗？
A: 可以。在配置中添加环境判断即可：
```js
preloader({
  routes: process.env.NODE_ENV === 'production' ? [] : ['/dashboard', '/calendar']
})
```

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建你的特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交你的修改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启一个 Pull Request

## 📄 许可证

MIT © ChenYu

---

**🎯 一行配置，极致性能！让你的 Vue 应用飞起来！** 🚀