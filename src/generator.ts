// ============================================================================
// 🛠️ src/generator.ts - 代码生成器
// ============================================================================

import type { PreloaderOptions, PreloadRoute } from './types'
import { runtimeTemplate } from './runtime'

export class CodeGenerator {
  constructor(private options: PreloaderOptions) {}

  /**
   * 生成运行时代码
   */
  generateRuntime(): string {
    const routes = this.processRoutes()
    const options = this.processOptions()

    return runtimeTemplate
      .replace('__PRELOAD_ROUTES__', JSON.stringify(routes, null, 2))
      .replace('__PRELOAD_OPTIONS__', JSON.stringify(options, null, 2))
  }

  /**
   * 处理路由配置
   */
  private processRoutes(): any[] {
    return this.options.routes.map(route => {
      const componentPath = route.component || this.inferComponentPath(route.path)
      return {
        path: route.path,
        component: `() => import('${componentPath}')`,
        reason: route.reason || '用户配置的预加载页面',
        priority: route.priority || 2
      }
    })
  }

  /**
   * 处理选项配置
   */
  private processOptions() {
    return {
      delay: this.options.delay || 2000,
      showStatus: this.options.showStatus !== false,
      statusPosition: this.options.statusPosition || 'bottom-right',
      debug: this.options.debug || false
    }
  }

  /**
   * 推断组件路径
   */
  private inferComponentPath(routePath: string): string {
    const cleanPath = routePath.replace(/^\//, '').replace(/\//g, '-')
    return `@/views/${cleanPath}/index.vue`
  }

  /**
   * 生成HTML注入代码
   */
  generateHtmlInject(): string {
    if (this.options.showStatus === false) return ''
    
    return '<preloader-status></preloader-status>'
  }
}