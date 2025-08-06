// ============================================================================
// 🚀 src/index.ts - 主插件文件
// ============================================================================

import type { Plugin } from 'vite'
import type { PreloaderOptions } from './types'
import { CodeGenerator } from './generator'

const VIRTUAL_MODULE_ID = 'virtual:preloader'
const RESOLVED_VIRTUAL_MODULE_ID = '\0' + VIRTUAL_MODULE_ID

export default function preloaderPlugin(options: PreloaderOptions): Plugin {
  let generator: CodeGenerator

  return {
    name: 'vite-plugin-preloader',
    
    // 🎯 设置插件执行顺序
    enforce: 'post',
    
    configResolved() {
      generator = new CodeGenerator(options)
      console.log(`🚀 预加载插件已启用，配置了 ${options.routes.length} 个路由`)
    },

    resolveId(id) {
      if (id === VIRTUAL_MODULE_ID) {
        return RESOLVED_VIRTUAL_MODULE_ID
      }
      return null // 🔧 修复：明确返回 null
    },

    load(id) {
      if (id === RESOLVED_VIRTUAL_MODULE_ID) {
        return generator.generateRuntime()
      }
      return null // 🔧 修复：明确返回 null
    },

    // 🎨 HTML 转换（修复类型错误）
    transformIndexHtml(html) {
      const inject = generator.generateHtmlInject()
      if (inject) {
        return html.replace(
          '<div id="app">',
          `<div id="app">\n    ${inject}`
        )
      }
      return html // 🔧 修复：确保总是返回 html
    },

    // 🔥 HMR 支持
    handleHotUpdate(ctx) {
      if (ctx.file.includes('vite.config')) {
        console.log('🔄 预加载配置已更新')
        ctx.server.ws.send({
          type: 'full-reload'
        })
        return []
      }
      return undefined // 🔧 修复：明确返回 undefined
    }
  }
}

// 命名导出，支持多种导入方式
export { type PreloaderOptions, type PreloadRoute } from './types'