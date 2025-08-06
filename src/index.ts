// ============================================================================
// 🚀 src/index.ts - 主插件文件
// ============================================================================
import type { Plugin } from 'vite'
import type { PreloaderOptions } from './types'
import { CodeGenerator } from './generator'

export default function preloaderPlugin(options: PreloaderOptions): Plugin {
  let generator: CodeGenerator
  const isDev = process.env.NODE_ENV !== 'production'
  
  // 智能默认配置
  const finalOptions = {
    debug: isDev, // 开发环境默认开启调试
    delay: 2000,  // 默认2秒
    showStatus: true, // 默认显示状态
    statusPosition: 'bottom-right' as const, // 默认右下角
    ...options // 用户配置覆盖默认配置
  }

  return {
    name: 'vite-plugin-preloader',
    
    // 🎯 设置插件执行顺序
    enforce: 'post',
    
    configResolved() {
      generator = new CodeGenerator(finalOptions)
      
      if (finalOptions.debug) {
        console.log(`🚀 [预加载插件] 已启用，配置了 ${finalOptions.routes.length} 个路由`)
        console.log('📋 [预加载插件] 路由列表:', finalOptions.routes)
        console.log('⚙️ [预加载插件] 配置选项:', {
          delay: finalOptions.delay,
          showStatus: finalOptions.showStatus,
          statusPosition: finalOptions.statusPosition,
          debug: finalOptions.debug
        })
      }
    },

    // 🎨 HTML 转换 - 直接注入脚本到 HTML
    transformIndexHtml(html) {
      const inject = generator.generateHtmlInject()
      
      if (finalOptions.debug) {
        console.log('🎨 [预加载插件] 注入预加载脚本到 HTML')
      }
      
      // 注入到 head 标签末尾
      return html.replace('</head>', `${inject}\n</head>`)
    },

    // 🔥 HMR 支持
    handleHotUpdate(ctx) {
      if (ctx.file.includes('vite.config')) {
        if (finalOptions.debug) {
          console.log('🔄 [预加载插件] 配置已更新')
        }
        ctx.server.ws.send({
          type: 'full-reload'
        })
        return []
      }
      return undefined
    }
  }
}

// 命名导出，支持多种导入方式
export { type PreloaderOptions, type PreloadRoute } from './types'