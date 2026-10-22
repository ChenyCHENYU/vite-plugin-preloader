// ============================================================================
// 🛠️ src/generator.ts - 代码生成器
// v2.1 核心改动：
//   1. chunkPath 拼接 config.base，支持子路径部署与绝对 URL base
//   2. 组件绝对路径与 facadeModuleId 统一 realpath 归一，
//      symlink 场景（macOS /tmp、pnpm workspace、monorepo）不再静默失配
//   3. 生产 prefetch 改由运行时脚本注入，静态 <link> 注入仅保留 dev 的
//      modulepreload；生产 HTML 由 generateBundle 直改 asset source
// ============================================================================
import type { ResolvedConfig } from 'vite'
import type { PreloaderOptions, ResolvedRoute } from './types'
import { buildRuntimeScript } from './runtime'
import { normalizePath } from 'vite'
import path from 'node:path'
import fs from 'node:fs'

/** 鸭子类型兼容 rollup / rolldown 的 bundle 条目（Vite 8 切换到 rolldown） */
export interface BundleItem {
  type: string
  fileName?: string
  facadeModuleId?: string | null
  /** 静态 import 的 chunk 文件名（动态 import 不在其中） */
  imports?: readonly string[]
  isEntry?: boolean
  source?: string | Uint8Array
}
export type OutputBundleCompat = Record<string, BundleItem>

/**
 * 收集所有入口 chunk 的静态依赖闭包（文件名集合）。
 * 这些 chunk 浏览器加载页面时本就会立即拉取，对其 prefetch 是纯浪费
 */
function collectEagerChunkNames(bundle: OutputBundleCompat): Set<string> {
  const eager = new Set<string>()
  const visited = new Set<string>()
  const visit = (fileName: string) => {
    if (visited.has(fileName)) return
    visited.add(fileName)
    eager.add(fileName)
    const chunk = bundle[fileName]
    for (const dep of chunk?.imports ?? []) visit(dep)
  }
  for (const [fileName, chunk] of Object.entries(bundle)) {
    if (chunk.type === 'chunk' && chunk.isEntry) visit(fileName)
  }
  return eager
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export class CodeGenerator {
  /** @ 别名对应的相对路径（相对于 viteRoot），默认 'src' */
  private srcAlias = 'src'
  private viteRoot = process.cwd()
  /** resolvedConfig.base，归一为以 / 结尾（绝对 URL base 同样满足） */
  private viteBase = '/'
  private realpathCache = new Map<string, string>()

  constructor(private readonly options: Required<PreloaderOptions>) {}

  /**
   * 从 Vite resolvedConfig 中读取项目根目录、base 和 @ 别名
   * 必须在 configResolved hook 中调用
   */
  setViteConfig(config: ResolvedConfig): void {
    this.viteRoot = config.root
    this.viteBase = config.base || '/'
    if (!this.viteBase.endsWith('/')) this.viteBase += '/'

    // 统一处理数组/对象两种 alias 格式
    const alias = config.resolve?.alias
    const entries: Array<{ find: string | RegExp; replacement: string }> = Array.isArray(alias)
      ? (alias as Array<{ find: string | RegExp; replacement: string }>)
      : Object.entries(alias ?? {}).map(([find, replacement]) => ({ find, replacement: replacement as string }))

    const atEntry = entries.find(
      (a) => a.find === '@' || (a.find instanceof RegExp && a.find.source === '^@/'),
    )
    if (atEntry && typeof atEntry.replacement === 'string') {
      const rel = normalizePath(path.relative(this.viteRoot, atEntry.replacement)).replace(/\/+$/, '')
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
   * 根据 Rollup/Rolldown OutputBundle 中的 facadeModuleId 为各路由匹配实际 chunk 文件路径
   * 仅在生产构建的 generateBundle hook 中调用。
   *
   * 匹配策略（逐级降级，最大化"不写 component 也能命中"）：
   *   1. 显式/推断的 component 路径
   *   2. 目录与扩展名约定候选：views|pages × {path}/index.* × {path}.* × vue/js/ts/jsx/tsx
   *   3. 结构化兜底：chunkMap 中以 /{views|pages}/{path}(/index)?.* 结尾的模块
   *
   * 命中后若该 chunk 已被任一入口 chunk 静态依赖（浏览器本就会立即加载），
   * 视为无预加载价值，返回时不携带 chunkPath
   */
  fillChunkPaths(routes: ResolvedRoute[], bundle: OutputBundleCompat): ResolvedRoute[] {
    // realpath 归一后的绝对路径 → chunk 文件名
    const chunkByAbs = new Map<string, string>()
    for (const [fileName, chunkOrAsset] of Object.entries(bundle)) {
      if (chunkOrAsset.type !== 'chunk') continue
      if (!chunkOrAsset.facadeModuleId) continue
      chunkByAbs.set(this.toRealPath(chunkOrAsset.facadeModuleId), fileName)
    }

    const eager = collectEagerChunkNames(bundle)

    return routes.map((route) => {
      for (const candidate of this.candidateComponents(route)) {
        const fileName = chunkByAbs.get(this.toRealPath(this.resolveComponentAbsPath(candidate)))
        if (!fileName || eager.has(fileName)) continue
        return { ...route, chunkPath: this.viteBase + fileName }
      }
      // 结构化兜底：按 /{views|pages}/{path}(/index)?.* 结尾精确匹配模块路径段
      const cleanPath = route.path.replace(/^\//, '').replace(/\/$/, '')
      if (cleanPath) {
        const suffixRe = new RegExp(`/(?:views|pages)/${escapeRegExp(cleanPath)}(?:/index)?\\.[a-z]+$`)
        for (const [abs, fileName] of chunkByAbs) {
          if (!suffixRe.test(abs)) continue
          if (eager.has(fileName)) continue
          return { ...route, chunkPath: this.viteBase + fileName }
        }
      }
      return route
    })
  }

  /**
   * 生成 dev 模式静态注入的 <link rel="modulepreload"> 标签
   * 生产模式的 prefetch 不做静态注入（由运行时脚本在 load + delay 后创建）
   */
  generateLinkTags(routes: ResolvedRoute[]): string {
    return routes
      .map((route) => {
        const href = this.toDevHref(route.component)
        return `<link rel="modulepreload" href="${href}" data-preloader="${encodeURIComponent(route.path)}">`
      })
      .join('\n')
  }

  /**
   * 生成运行时脚本：生产含 prefetch 注入器（必选）+ 状态角标/调试（可选）
   * showStatus=false 且 debug=false 的 dev 模式返回空字符串（零注入）
   */
  generateRuntimeScript(routes: ResolvedRoute[], isBuild: boolean): string {
    return buildRuntimeScript({
      delay: this.options.delay,
      debug: this.options.debug,
      showStatus: this.options.showStatus,
      statusPosition: this.options.statusPosition,
      strategy: this.options.strategy,
      isBuild,
      routes: routes.map((r) => ({
        path: r.path,
        chunkPath: r.chunkPath ?? null,
        reason: r.reason,
      })),
    })
  }

  /** 将片段注入到 </body> 前，无 </body> 时追加到末尾 */
  injectIntoHtml(html: string, inject: string): string {
    if (html.includes('</body>')) {
      return html.replace('</body>', `${inject}\n</body>`)
    }
    return html + '\n' + inject
  }

  // --------------------------------------------------------------------------
  // 私有工具方法
  // --------------------------------------------------------------------------

  /** 根据路由路径推断 Vue 组件路径（@/views/{path}/index.vue） */
  private inferComponentPath(routePath: string): string {
    const cleanPath = routePath.replace(/^\//, '').replace(/\/$/, '')
    return `@/views/${cleanPath}/index.vue`
  }

  /**
   * 生成候选组件路径：显式/推断的 component 优先，命中即返回；
   * 未命中继续尝试目录（views/pages）× 扩展名（vue/js/ts/jsx/tsx）×
   * 文件形态（{path}/index.* 与 {path}.*）的约定组合，
   * 让不符合单一约定的项目结构也能零配置匹配
   */
  private candidateComponents(route: ResolvedRoute): string[] {
    const cleanPath = route.path.replace(/^\//, '').replace(/\/$/, '')
    const candidates = [route.component]
    if (!cleanPath) {
      // 根路由：@/views/index.* 与 @/pages/index.*
      candidates.push('@/views/index.vue', '@/views/index.js', '@/pages/index.vue', '@/pages/index.js')
      return candidates
    }
    for (const dir of ['views', 'pages']) {
      for (const ext of ['vue', 'js', 'ts', 'jsx', 'tsx']) {
        candidates.push(`@/${dir}/${cleanPath}/index.${ext}`, `@/${dir}/${cleanPath}.${ext}`)
      }
    }
    return candidates
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

  /**
   * realpath + normalizePath 归一：facadeModuleId 是打包器解析后的真实路径，
   * config.root 拼出的路径可能含 symlink 前缀（macOS /tmp→/private/tmp、
   * pnpm workspace 等），两侧统一归一后比对
   */
  private toRealPath(p: string): string {
    const cached = this.realpathCache.get(p)
    if (cached) return cached
    let real = p
    try {
      real = fs.realpathSync(p)
    } catch {
      // 路径不存在（推断错误等）时保留原值，交给 Map 查找自然失配
    }
    const norm = normalizePath(real)
    this.realpathCache.set(p, norm)
    return norm
  }

  /** dev 模式组件路径 → dev server 可解析的 URL（始终以 / 开头，避免相对当前页面解析） */
  private toDevHref(component: string): string {
    if (component.startsWith('@/')) {
      return `/${this.srcAlias}/${component.slice(2)}`
    }
    if (component.startsWith('/')) {
      return component
    }
    return `/${component.replace(/^\.\//, '')}`
  }
}
