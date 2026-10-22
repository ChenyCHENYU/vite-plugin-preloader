// ============================================================================
// 🧪 test/generator.spec.ts - CodeGenerator 单元测试
// 覆盖：路由解析过滤、@ 别名解析、dev href 归一、
//       fillChunkPaths 的 base 拼接与 realpath（symlink）归一
// ============================================================================
import { describe, it, expect } from 'vitest'
import { CodeGenerator } from '../src/generator'
import type { PreloaderOptions } from '../src/types'
import type { ResolvedConfig } from 'vite'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const baseOptions = {
  routes: [],
  delay: 2000,
  debug: false,
  showStatus: false,
  statusPosition: 'bottom-right' as const,
  exclude: [],
  strategy: 'all' as const,
}

function makeGenerator(overrides: Partial<PreloaderOptions> = {}): CodeGenerator {
  return new CodeGenerator({ ...baseOptions, ...overrides } as Required<PreloaderOptions>)
}

function mockConfig(over: Partial<ResolvedConfig> = {}): ResolvedConfig {
  return {
    root: '/project',
    base: '/',
    resolve: { alias: [{ find: '@', replacement: '/project/src' }] },
    ...over,
  } as unknown as ResolvedConfig
}

describe('resolveRoutes', () => {
  it('字符串路由自动推断 @/views/{path}/index.vue', () => {
    const g = makeGenerator({ routes: ['/dashboard'] })
    expect(g.resolveRoutes()).toEqual([
      {
        path: '/dashboard',
        component: '@/views/dashboard/index.vue',
        reason: '自动推断的预加载页面',
        priority: 2,
      },
    ])
  })

  it('过滤含 :param 的动态路由', () => {
    const g = makeGenerator({ routes: ['/a', '/b/:id', '/c/:type/edit'] })
    expect(g.resolveRoutes().map((r) => r.path)).toEqual(['/a'])
  })

  it('exclude 精确与前缀匹配，但不误伤同前缀兄弟路由', () => {
    const g = makeGenerator({ routes: ['/x', '/x/y', '/xy', '/z'], exclude: ['/x'] })
    expect(g.resolveRoutes().map((r) => r.path)).toEqual(['/xy', '/z'])
  })

  it('按 priority 升序排序', () => {
    const g = makeGenerator({
      routes: [
        { path: '/low', priority: 9 },
        { path: '/high', priority: 1 },
      ],
    })
    expect(g.resolveRoutes().map((r) => r.path)).toEqual(['/high', '/low'])
  })
})

describe('generateLinkTags（dev modulepreload）', () => {
  it('@/ 别名映射为 /src/ URL', () => {
    const g = makeGenerator()
    g.setViteConfig(mockConfig())
    const tags = g.generateLinkTags([
      { path: '/a', component: '@/views/a/index.vue', reason: '', priority: 2 },
    ])
    expect(tags).toContain('rel="modulepreload"')
    expect(tags).toContain('href="/src/views/a/index.vue"')
    expect(tags).toContain(`data-preloader="${encodeURIComponent('/a')}"`)
  })

  it('相对路径归一为项目根相对 URL，避免相对当前页面解析', () => {
    const g = makeGenerator()
    g.setViteConfig(mockConfig())
    const tags = g.generateLinkTags([
      { path: '/b', component: 'src/views/b.vue', reason: '', priority: 2 },
    ])
    expect(tags).toContain('href="/src/views/b.vue"')
  })

  it('以 / 开头的路径直通', () => {
    const g = makeGenerator()
    g.setViteConfig(mockConfig())
    const tags = g.generateLinkTags([
      { path: '/c', component: '/src/views/c.vue', reason: '', priority: 2 },
    ])
    expect(tags).toContain('href="/src/views/c.vue"')
  })
})

describe('fillChunkPaths', () => {
  it('匹配 chunk 且拼接 base；symlink root 下不静默失配', () => {
    // 真实目录（facadeModuleId 形态）+ 指向它的 symlink root（config.root 形态）
    const realRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vpp-real-'))
    const linkedRoot = realRoot + '-link'
    fs.symlinkSync(realRoot, linkedRoot)
    fs.mkdirSync(path.join(realRoot, 'src', 'views', 'a'), { recursive: true })
    const componentFile = path.join(realRoot, 'src', 'views', 'a', 'index.js')
    fs.writeFileSync(componentFile, 'export default 1')

    const g = makeGenerator()
    g.setViteConfig(
      mockConfig({
        root: linkedRoot,
        base: '/app/',
        resolve: { alias: [{ find: '@', replacement: path.join(linkedRoot, 'src') }] },
      }),
    )

    const routes = [
      { path: '/a', component: '@/views/a/index.js', reason: '', priority: 2 },
      { path: '/miss', component: '@/views/miss/index.js', reason: '', priority: 2 },
    ]
    const bundle = {
      'assets/a-B2xQ9.js': {
        type: 'chunk',
        facadeModuleId: componentFile, // 打包器侧为 realpath 形态
      },
    }

    const filled = g.fillChunkPaths(routes, bundle as never)
    expect(filled[0].chunkPath).toBe('/app/assets/a-B2xQ9.js')
    expect(filled[1].chunkPath).toBeUndefined()

    fs.rmSync(realRoot, { recursive: true, force: true })
    fs.rmSync(linkedRoot, { force: true })
  })

  it('智能匹配：不写 component 时按目录/扩展名约定候选命中', () => {
    const realRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vpp-smart-'))
    fs.mkdirSync(path.join(realRoot, 'src', 'views'), { recursive: true })
    // 实际文件是 views/dashboard.vue，而默认推断是 views/dashboard/index.vue
    const componentFile = path.join(realRoot, 'src', 'views', 'dashboard.vue')
    fs.writeFileSync(componentFile, 'export default 1')

    const g = makeGenerator()
    g.setViteConfig(
      mockConfig({ root: realRoot, resolve: { alias: [{ find: '@', replacement: path.join(realRoot, 'src') }] } }),
    )
    // component 缺省 → resolveRoutes 推断 index.vue → 候选降级命中 dashboard.vue
    const filled = g.fillChunkPaths(
      [{ path: '/dashboard', component: '@/views/dashboard/index.vue', reason: '', priority: 2 }],
      { 'assets/dash-hash.js': { type: 'chunk', facadeModuleId: componentFile } } as never,
    )
    expect(filled[0].chunkPath).toBe('/assets/dash-hash.js')
    fs.rmSync(realRoot, { recursive: true, force: true })
  })

  it('智能匹配：结构化兜底命中任意目录下的 /views/{path}/index.*', () => {
    const realRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vpp-fallback-'))
    fs.mkdirSync(path.join(realRoot, 'src', 'nested', 'views', 'z'), { recursive: true })
    const componentFile = path.join(realRoot, 'src', 'nested', 'views', 'z', 'index.vue')
    fs.writeFileSync(componentFile, 'export default 1')

    const g = makeGenerator()
    g.setViteConfig(
      mockConfig({ root: realRoot, resolve: { alias: [{ find: '@', replacement: path.join(realRoot, 'src') }] } }),
    )
    const filled = g.fillChunkPaths(
      [{ path: '/z', component: '@/views/z/index.vue', reason: '', priority: 2 }],
      { 'assets/z-hash.js': { type: 'chunk', facadeModuleId: componentFile } } as never,
    )
    expect(filled[0].chunkPath).toBe('/assets/z-hash.js')
    fs.rmSync(realRoot, { recursive: true, force: true })
  })

  it('eager 剔除：路由 chunk 已被入口静态依赖时不预取', () => {
    const realRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vpp-eager-'))
    fs.mkdirSync(path.join(realRoot, 'src', 'views'), { recursive: true })
    const componentFile = path.join(realRoot, 'src', 'views', 'shared.js')
    fs.writeFileSync(componentFile, 'export default 1')

    const g = makeGenerator()
    g.setViteConfig(
      mockConfig({ root: realRoot, resolve: { alias: [{ find: '@', replacement: path.join(realRoot, 'src') }] } }),
    )
    const filled = g.fillChunkPaths(
      [{ path: '/shared', component: '@/views/shared.js', reason: '', priority: 2 }],
      {
        'assets/entry-hash.js': { type: 'chunk', isEntry: true, imports: ['assets/shared-hash.js'] },
        'assets/shared-hash.js': { type: 'chunk', facadeModuleId: componentFile },
      } as never,
    )
    // 命中 chunk 但被入口静态依赖 → 不携带 chunkPath
    expect(filled[0].chunkPath).toBeUndefined()
    fs.rmSync(realRoot, { recursive: true, force: true })
  })

  it('无 base 时生成根路径', () => {
    const realRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vpp-real2-'))
    fs.mkdirSync(path.join(realRoot, 'src', 'views'), { recursive: true })
    const componentFile = path.join(realRoot, 'src', 'views', 'b.js')
    fs.writeFileSync(componentFile, 'export default 1')

    const g = makeGenerator()
    g.setViteConfig(
      mockConfig({ root: realRoot, resolve: { alias: [{ find: '@', replacement: path.join(realRoot, 'src') }] } }),
    )
    const filled = g.fillChunkPaths(
      [{ path: '/b', component: '@/views/b.js', reason: '', priority: 2 }],
      { 'assets/b-hash.js': { type: 'chunk', facadeModuleId: componentFile } } as never,
    )
    expect(filled[0].chunkPath).toBe('/assets/b-hash.js')
    fs.rmSync(realRoot, { recursive: true, force: true })
  })

  it('CSS 关联：组件引入的样式产物随路由一起填充 cssPaths（含 base）', () => {
    const realRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vpp-css-'))
    fs.mkdirSync(path.join(realRoot, 'src', 'views', 'c'), { recursive: true })
    const componentFile = path.join(realRoot, 'src', 'views', 'c', 'index.js')
    fs.writeFileSync(componentFile, "import './style.css'")

    const g = makeGenerator()
    g.setViteConfig(
      mockConfig({
        root: realRoot,
        base: '/app/',
        resolve: { alias: [{ find: '@', replacement: path.join(realRoot, 'src') }] },
      }),
    )
    const filled = g.fillChunkPaths(
      [{ path: '/c', component: '@/views/c/index.js', reason: '', priority: 2 }],
      {
        'assets/c-hash.js': { type: 'chunk', facadeModuleId: componentFile },
        'assets/c-style.css': {
          type: 'asset',
          originalFileNames: ['src/views/c/index.js'],
        },
      } as never,
    )
    expect(filled[0].chunkPath).toBe('/app/assets/c-hash.js')
    expect(filled[0].cssPaths).toEqual(['/app/assets/c-style.css'])
    fs.rmSync(realRoot, { recursive: true, force: true })
  })

  it('体积感知排序：同 priority 时小 chunk 在前，priority 仍最优先', () => {
    const realRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vpp-sort-'))
    fs.mkdirSync(path.join(realRoot, 'src', 'views'), { recursive: true })
    const small = path.join(realRoot, 'src', 'views', 'small.js')
    const big = path.join(realRoot, 'src', 'views', 'big.js')
    const lowP = path.join(realRoot, 'src', 'views', 'lowp.js')
    fs.writeFileSync(small, '1')
    fs.writeFileSync(big, '1')
    fs.writeFileSync(lowP, '1')

    const g = makeGenerator()
    g.setViteConfig(
      mockConfig({ root: realRoot, resolve: { alias: [{ find: '@', replacement: path.join(realRoot, 'src') }] } }),
    )
    const filled = g.fillChunkPaths(
      [
        { path: '/big', component: '@/views/big.js', reason: '', priority: 2 },
        { path: '/small', component: '@/views/small.js', reason: '', priority: 2 },
        { path: '/lowp', component: '@/views/lowp.js', reason: '', priority: 1 },
      ],
      {
        'assets/big-hash.js': { type: 'chunk', facadeModuleId: big, codeLength: 9000 },
        'assets/small-hash.js': { type: 'chunk', facadeModuleId: small, codeLength: 100 },
        'assets/lowp-hash.js': { type: 'chunk', facadeModuleId: lowP, codeLength: 99999 },
      } as never,
    )
    // priority 1 最先；同 priority=2 中 small(100B) 先于 big(9000B)
    expect(filled.map((r) => r.path)).toEqual(['/lowp', '/small', '/big'])
    fs.rmSync(realRoot, { recursive: true, force: true })
  })
})

describe('injectIntoHtml', () => {
  it('注入到 </body> 前，无 </body> 时追加末尾', () => {
    const g = makeGenerator()
    expect(g.injectIntoHtml('<html><body>x</body></html>', '<!--i-->')).toBe(
      '<html><body>x<!--i-->\n</body></html>',
    )
    expect(g.injectIntoHtml('plain', '<!--i-->')).toBe('plain\n<!--i-->')
  })
})
