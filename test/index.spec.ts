// ============================================================================
// 🧪 test/index.spec.ts - 插件入口 hooks 编排测试
// 覆盖：dev 注入 modulepreload + runtime、build 直通 transformIndexHtml、
//       debug 默认值随 command 切换、build 注入结果缓存、handleHotUpdate 已移除
// ============================================================================
import { describe, it, expect, vi, afterEach } from 'vitest'
import preloader from '../src/index'
import type { ResolvedConfig } from 'vite'

function mockConfig(over: Partial<ResolvedConfig> = {}): ResolvedConfig {
  return {
    command: 'serve',
    root: '/project',
    base: '/',
    resolve: { alias: [{ find: '@', replacement: '/project/src' }] },
    ...over,
  } as unknown as ResolvedConfig
}

function setup(command: 'serve' | 'build', plugin = preloader({ routes: ['/a'], debug: false, showStatus: false })) {
  const p = plugin as unknown as Record<string, (arg0: unknown, arg1?: unknown) => unknown>
  p.configResolved(mockConfig({ command }))
  return p
}

afterEach(() => vi.restoreAllMocks())

describe('hooks 编排', () => {
  it('dev：transformIndexHtml 注入 modulepreload（指向 /src/）', () => {
    const p = setup('serve')
    const html = p.transformIndexHtml('<html><body>x</body></html>') as string
    expect(html).toContain('<link rel="modulepreload" href="/src/views/a/index.vue"')
    expect(html).toContain('</body>')
  })

  it('dev：transformIndexHtml 结果缓存（两次调用内容一致）', () => {
    const p = setup('serve')
    const first = p.transformIndexHtml('<html><body></body></html>')
    const second = p.transformIndexHtml('<html><body></body></html>')
    expect(first).toBe(second)
  })

  it('build：transformIndexHtml 直通（HTML 由 generateBundle 直改 asset）', () => {
    const p = setup('build')
    const html = '<html><body>x</body></html>'
    expect(p.transformIndexHtml(html)).toBe(html)
  })

  it('build：generateBundle 把运行时脚本写入 HTML asset', () => {
    const p = setup('build')
    const asset = { type: 'asset', fileName: 'index.html', source: '<html><body></body></html>' }
    p.generateBundle({}, { 'index.html': asset })
    expect(asset.source as string).toContain('vite-plugin-preloader v2 - prefetch injector')
    // 非 HTML 条目不动
    const chunk = { type: 'chunk', fileName: 'assets/x.js', source: 'x' }
    p.generateBundle({}, { 'assets/x.js': chunk })
    expect(chunk.source).toBe('x')
  })

  it('debug 默认值：serve 开、build 关（未显式指定时）', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    setup('serve', preloader({ routes: ['/a'] }))
    expect(logSpy).toHaveBeenCalled()
    logSpy.mockClear()

    setup('build', preloader({ routes: ['/a'] }))
    expect(logSpy).not.toHaveBeenCalled()
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('大路由表（>12）debug 警告', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const p = preloader({
      routes: Array.from({ length: 13 }, (_, i) => `/r${i}`),
    }) as unknown as Record<string, (arg0: unknown) => unknown>
    p.configResolved(mockConfig({ command: 'serve' }))
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('12'))
  })

  it('不再包含 handleHotUpdate（Vite 对 config 变更自动重启）', () => {
    const plugin = preloader({ routes: [] }) as unknown as Record<string, unknown>
    expect(plugin.handleHotUpdate).toBeUndefined()
  })

  it('SSR 构建不启用', () => {
    const plugin = preloader({ routes: ['/a'] }) as unknown as {
      apply: (id: unknown, env: { isSsrBuild: boolean }) => boolean
    }
    expect(plugin.apply({}, { isSsrBuild: true })).toBe(false)
    expect(plugin.apply({}, { isSsrBuild: false })).toBe(true)
  })
})
