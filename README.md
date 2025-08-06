# 🚀 vite-plugin-preloader

智能路由预加载 Vite 插件，一行配置，极致性能！

## ✨ 特性

- 🎯 **一行配置** - 在 `vite.config.js` 中配置即可
- ⚡ **零运行时开销** - 构建时生成，运行时高效
- 🎨 **自动注入** - 无需手动调用，全自动工作
- 🛠️ **开发友好** - 提供调试工具和状态显示
- 📦 **类型安全** - 完整的 TypeScript 支持
- 🔥 **热更新支持** - 配置变更时自动更新

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

## 🚀 使用

### 基础配置

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
        { 
          path: '/calendar', 
          reason: '日历组件包含大型库',
          priority: 1 
        },
        { 
          path: '/charts', 
          component: '@/views/charts/index.vue',
          reason: '图表页面较重', 
          priority: 1 
        }
      ]
    })
  ]
})
```

就这样！无需其他任何代码，插件会自动：
- 🎯 生成预加载逻辑
- 📦 注入到应用中
- 🎨 显示加载状态
- 🛠️ 提供调试工具

### 完整配置示例

```js
preloader({
  routes: [
    // 🔥 高优先级 - 核心页面
    { 
      path: '/dashboard', 
      component: '@/views/dashboard/index.vue',
      reason: '主仪表盘，用户访问频率最高',
      priority: 1 
    },
    
    // ⚡ 中优先级 - 常用页面
    { 
      path: '/calendar', 
      reason: '日历组件包含 @fullcalendar 全家桶(~500KB)',
      priority: 2 
    },
    
    // 📊 低优先级 - 重型工具页面
    { 
      path: '/reports', 
      component: '@/views/reports/index.vue',
      reason: '报表页面包含 echarts + d3 图表库(~800KB)',
      priority: 3 
    }
  ],
  delay: 2000,                    // 延迟时间
  showStatus: true,               // 显示状态
  statusPosition: 'bottom-right', // 状态位置
  debug: true                     // 开发调试
})
```

## 🎯 配置选项

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `routes` | `PreloadRoute[]` | `[]` | 预加载路由配置 |
| `delay` | `number` | `2000` | 延迟时间(ms) |
| `showStatus` | `boolean` | `true` | 显示状态 |
| `statusPosition` | `string` | `'bottom-right'` | 状态位置 |
| `debug` | `boolean` | `false` | 开发调试 |

### PreloadRoute 配置

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `path` | `string` | ✅ | 路由路径 |
| `component` | `string` | ❌ | 组件路径（不填自动推断） |
| `reason` | `string` | ❌ | 预加载原因说明 |
| `priority` | `number` | ❌ | 优先级 1-5（数字越小越先加载） |

## 🛠️ 开发调试

开发环境下，浏览器控制台可用：

```js
// 查看预加载统计
window.preloaderDebug.stats()

// 检查指定路由状态  
window.preloaderDebug.check('/calendar')

// 重新开始预加载
window.preloaderDebug.restart()

// 显示帮助信息
window.preloaderDebug.help()
```

## 📊 控制台输出示例

```
🚀 预加载插件已启用，配置了 3 个路由
🚀 [预加载] 开始预加载 3 个页面
✅ [预加载] /calendar (234ms) - 日历组件包含 @fullcalendar 全家桶
✅ [预加载] /charts (456ms) - 图表页面包含 echarts、@antv/x6
✅ [预加载] /reports (678ms) - 报表页面包含 echarts + d3 图表库
🎉 [预加载] 完成! 耗时 1234ms
```

## 🎨 状态显示

插件会在页面右下角显示预加载状态：

```
🔄 正在优化页面... 2/3
```

状态位置可通过 `statusPosition` 配置：
- `'top-left'` - 左上角
- `'top-right'` - 右上角  
- `'bottom-left'` - 左下角
- `'bottom-right'` - 右下角（默认）

## 🔧 最佳实践

### 1. 优先级设置建议

```js
// 优先级 1: 核心业务页面（高频访问 + 大体积）
{ path: '/dashboard', priority: 1 }

// 优先级 2: 常用功能页面（中频访问 + 中体积）
{ path: '/calendar', priority: 2 }

// 优先级 3: 专业工具页面（低频访问 + 大体积）
{ path: '/reports', priority: 3 }
```

### 2. 组件路径自动推断

如果不指定 `component`，插件会自动推断：

```js
{ path: '/user-profile' }
// 自动推断为: @/views/user-profile/index.vue

{ path: '/admin/users' }  
// 自动推断为: @/views/admin-users/index.vue
```

### 3. 预加载原因说明

建议在 `reason` 中说明预加载的具体原因：

```js
{
  path: '/calendar',
  reason: '日历组件包含 @fullcalendar 全家桶(~500KB)',
  priority: 2
}
```

## 🚀 工作原理

1. **构建时分析** - 插件在构建时解析配置
2. **代码生成** - 自动生成预加载逻辑代码
3. **虚拟模块** - 创建 `virtual:preloader` 模块
4. **自动注入** - 将预加载代码注入到应用中
5. **智能调度** - 按优先级串行预加载，避免阻塞

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 License

MIT © ChenYu

---

**🎯 一行配置，极致性能！让你的 Vue 应用飞起来！** 🚀