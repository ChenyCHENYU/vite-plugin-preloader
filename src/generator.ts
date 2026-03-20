// ============================================================================
// 🛠️ src/generator.ts - 代码生成器
// v2 核心改动：
//   1. 读取 Vite ResolvedConfig 获取真实别名和根目录
//   2. 通过 Rollup OutputBundle 的 facadeModuleId 匹配真实 chunk 路径
//   3. 生成 <link rel="prefetch"> / <link rel="modulepreload"> 标签（浏览器原生调度）
//   4. 过滤动态路由参数（:param）和用户 exclude 列表
//   5. 状态脚本由 runtime.ts 独立生成，不再用运行时 import()
// ============================================================================
import type { ResolvedConfig } from 'vite'
import type { PreloaderOptions, ResolvedRoute } from './types'

// 使用鸭子类型兼容 rollup / rolldown（Vite 8 切换到 rolldown）
interface BundleChunk {
  type: string
  facadeModuleId?: string | null
}
type OutputBundleCompat = Record<string, BundleChunk>
import { buildRuntimeScript } from './runtime'
import { normalizePath } from 'vite'
import path from 'node:path'

export class CodeGenerator {
  /** @ 别名对应的相对路径（相对于 viteRoot），默认 'src' */
  private srcAlias = 'src'
  private viteRoot = process.cwd()

  constructor(private readonly options: Required<PreloaderOptions>) {}

  /**
   * 从 Vite resolvedConfig 中读取项目根目录和 @ 别名
   * 必须在 configResolved hook 中调用
   */
  setViteConfig(config: ResolvedConfig): void {
    this.viteRoot = config.root

    // 统一处理数组/对象两种 alias 格式
    const alias = config.resolve?.alias
    const entries: Array<{ find: string | RegExp; replacement: string }> = Array.isArray(alias)
      ? (alias as Array<{ find: string | RegExp; replacement: string }>)
      : Object.entries(alias ?? {}).map(([find, replacement]) => ({ find, replacement: replacement as string }))

    const atEntry = entries.find(
      (a) => a.find === '@' || (a.find instanceof RegExp && a.find.source === '^@/'),
    )
    if (atEntry && typeof atEntry.replacement === 'string') {
      const rel = normalizePath(path.relative(this.viteRoot, atEntry.replacement))
      if (rel) this.srcAlias = rel
    }
  }

  /**
   * 将用户路由配置解析为内部 ResolvedRoute 列表
   * 同时过滤：含 :param 的动态路由段、exclude 列表匹配项
   */
  resolveRoutes(): ResolvedRoute[] {
    if (!Array.isArray(this.options.routes) || this.options.routes.length === 0) {
      return []
    }

    const { exclude } = this.options

    return this.options.routes
      .map((route): ResolvedRoute => {
        if (typeof route === 'string') {
          return {
            path: route,
            component: this.inferComponentPath(route),
            reason: '自动推断的预加载页面',
            priority: 2,
          }
        }
        return {
          path: route.path,
          component: route.component ?? this.inferComponentPath(route.path),
          reason: route.reason ?? '用户配置的预加载页面',
          priority: route.priority ?? 2,
        }
      })
      .filter((route) => {
        // 过滤含动态参数的路由段（如 :id、:slug、:type）
        if (/:\w+/.test(route.path)) return false
        // 应用 exclude 过滤（精确匹配或前缀匹配）
        if (
          exclude.length > 0 &&
          exclude.some(
            (e) => route.path === e || route.path.startsWith(e.replace(/\/$/, '') + '/'),
          )
        ) {
          return false
        }
        return true
      })
      .sort((a, b) => a.priority - b.priority)
  }

  /**
   * 根据 Rollup OutputBundle 中的 facadeModuleId 为各路由匹配实际 chunk 文件路径
   * 仅在生产构建的 generateBundle hook 中调用
   */
  fillChunkPaths(routes: ResolvedRoute[], bundle: OutputBundleCompat): ResolvedRoute[] {
    // 构建 normalized-abs-path → '/assets/xxx-hash.js' 映射
    const chunkMap = new Map<string, string>()
    for (const [fileName, chunkOrAsset] of Object.entries(bundle)) {
      if (chunkOrAsset.type !== 'chunk') continue
      const chunk = chunkOrAsset as BundleChunk
      if (!chunk.facadeModuleId) continue
      chunkMap.set(normalizePath(chunk.facadeModuleId), '/' + fileName)
    }

    return routes.map((route) => {
      const absPath = normalizePath(this.resolveComponentAbsPath(route.component))
      const chunkPath = chunkMap.get(absPath)
      return chunkPath ? { ...route, chunkPath } : route
    })
  }

  /**
   * 生成 <link> 标签字符串（注入到 </body> 前）
   * 生产：<link rel="prefetch"> 指向实际 chunk（浏览器空闲时拉取，完全不阻塞主线程）
   * 开发：<link rel="modulepreload"> 指向源文件（Vite dev server 处理解析）
   */
  generateLinkTags(routes: ResolvedRoute[], isBuild: boolean): string {
    const tags: string[] = []

    for (const route of routes) {
      if (isBuild) {
        if (!route.chunkPath) continue // 找不到 chunk 则跳过，后续会 warn
        tags.push(
          `<link rel="prefetch" href="${route.chunkPath}" as="script" crossorigin data-preloader="${encodeURIComponent(route.path)}">`,
        )
      } else {
        // 开发模式：将 @/ 替换为 /<srcAlias>/
        const devPath = route.component.startsWith('@/')
          ? route.component.replace('@/', `/${this.srcAlias}/`)
          : route.component
        tags.push(
          `<link rel="modulepreload" href="${devPath}" data-preloader="${encodeURIComponent(route.path)}">`,
        )
      }
    }

    return tags.join('\n')
  }

  /**
   * 生成可选的状态 UI 和调试工具脚本
   * showStatus=false 且 debug=false 时返回空字符串（0 运行时开销）
   */
  generateRuntimeScript(routes: ResolvedRoute[], isBuild: boolean): string {
    return buildRuntimeScript({
      delay: this.options.delay,
      debug: this.options.debug,
      showStatus: this.options.showStatus,
      statusPosition: this.options.statusPosition,
      isBuild,
      routes: routes.map((r) => ({
        path: r.path,
        chunkPath: r.chunkPath ?? null,
        reason: r.reason,
      })),
    })
  }

  // --------------------------------------------------------------------------
  // 私有工具方法
  // --------------------------------------------------------------------------

  /** 根据路由路径推断 Vue 组件路径（@/views/{path}/index.vue） */
  private inferComponentPath(routePath: string): string {
    const cleanPath = routePath.replace(/^\//, '').replace(/\/$/, '')
    return `@/views/${cleanPath}/index.vue`
  }

  /** 将 @/ 别名路径或相对路径解析为绝对路径，用于与 facadeModuleId 比对 */
  private resolveComponentAbsPath(componentPath: string): string {
    if (componentPath.startsWith('@/')) {
      return path.join(this.viteRoot, this.srcAlias, componentPath.slice(2))
    }
    if (path.isAbsolute(componentPath)) {
      return componentPath
    }
    return path.join(this.viteRoot, componentPath)
  }
}
