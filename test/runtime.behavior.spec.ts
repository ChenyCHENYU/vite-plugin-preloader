// ============================================================================
// 🧪 test/runtime.behavior.spec.ts - 运行时脚本行为级测试
// 与 runtime.spec.ts 的字符串断言不同：这里在 happy-dom 里真实执行
// 生成的内联脚本，断言 DOM 行为——能抓住语法错误与逻辑错误
// 覆盖：all 分批注入（JS+CSS 成组、批次推进、超时兜底）、
//       viewport pointerover 预取、省流跳过、stats 命中统计
// ============================================================================
// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildRuntimeScript } from '../src/runtime'
import type { RuntimeConfig } from '../src/runtime'

function makeConfig(over: Partial<RuntimeConfig> = {}): RuntimeConfig {
  return {
    delay: 2000,
    debug: false,
    showStatus: false,
    statusPosition: 'bottom-right',
    strategy: 'all',
    isBuild: true,
    routes: [{ path: '/a', chunkPath: '/assets/a.js', reason: '' }],
    ...over,
  }
}

/** 执行生成的内联脚本（剥掉 <script> 标签） */
function exec(config: RuntimeConfig): void {
  const s = buildRuntimeScript(config)
  // eslint-disable-next-line no-new-func
  new Function(s.replace(/^<script>/, '').replace(/<\/script>$/, ''))()
}

function prefetchLinks(): HTMLLinkElement[] {
  return [...document.querySelectorAll('link[rel="prefetch"]')] as HTMLLinkElement[]
}

/** settle 一个 link（触发 load 事件） */
function settle(l: HTMLLinkElement): void {
  l.dispatchEvent(new Event('load'))
}

beforeEach(() => {
  vi.useFakeTimers()
  document.head.innerHTML = ''
  document.body.innerHTML = ''
  delete (window as { __preloaderDebug?: unknown }).__preloaderDebug
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  // 清理省流测试注入的 navigator.connection，避免影响后续用例
  delete (window.navigator as { connection?: unknown }).connection
})

describe('运行时行为（真实执行）', () => {
  it('all 模式：delay 后注入首批（≤4 路由），load 推进后续批次', () => {
    const routes = Array.from({ length: 5 }, (_, i) => ({
      path: `/r${i}`,
      chunkPath: `/assets/r${i}.js`,
      reason: '',
    }))
    exec(makeConfig({ routes }))
    expect(prefetchLinks()).toHaveLength(0)

    vi.advanceTimersByTime(2000) // readyState complete → setTimeout(init, delay)
    const first = prefetchLinks()
    expect(first).toHaveLength(4) // 第一批 4 个路由
    expect(first.every((l) => l.as === 'script' && l.crossOrigin === '')).toBe(true)

    first.forEach(settle) // 首批全部落定 → 放行第二批
    expect(prefetchLinks()).toHaveLength(5)
  })

  it('all 模式：路由的 CSS 与 JS 成组注入，成组落定才放行下一批', () => {
    // 5 个路由：首批 4 个（c 带 CSS + d1~d3），d4 在第二批
    exec(
      makeConfig({
        routes: [
          { path: '/c', chunkPath: '/assets/c.js', css: ['/assets/c.css'], reason: '' },
          { path: '/d1', chunkPath: '/assets/d1.js', reason: '' },
          { path: '/d2', chunkPath: '/assets/d2.js', reason: '' },
          { path: '/d3', chunkPath: '/assets/d3.js', reason: '' },
          { path: '/d4', chunkPath: '/assets/d4.js', reason: '' },
        ],
      }),
    )
    vi.advanceTimersByTime(2000)
    const links = prefetchLinks()
    expect(links.map((l) => l.getAttribute('href')).sort()).toEqual(
      ['/assets/c.css', '/assets/c.js', '/assets/d1.js', '/assets/d2.js', '/assets/d3.js'].sort(),
    )
    const css = links.find((l) => l.as === 'style')!
    const js = links.find((l) => l.as === 'script' && l.getAttribute('href') === '/assets/c.js')!
    expect(css.getAttribute('crossorigin')).toBe(null) // CSS link 不带 crossorigin
    expect(js.getAttribute('crossorigin')).toBe('') // JS link 为 anonymous

    settle(css) // c 路由的 JS 未落定 → 整路由未完成 → 下一批不放行
    expect(prefetchLinks()).toHaveLength(5)
    settle(js)
    links.filter((l) => l.getAttribute('href')?.startsWith('/assets/d')).forEach(settle)
    expect(prefetchLinks()).toHaveLength(6) // 首批全路由落定 → 放行 d4
  })

  it('省流网络（saveData）跳过全部预取', () => {
    Object.defineProperty(window.navigator, 'connection', {
      configurable: true,
      value: { saveData: true },
    })
    exec(makeConfig({ debug: true }))
    vi.advanceTimersByTime(2000)
    expect(prefetchLinks()).toHaveLength(0)
  })

  it('viewport 模式：pointerover 委托触发预取（含 CSS），同路由幂等', () => {
    document.body.innerHTML = '<nav><a href="/a">A</a></nav>'
    exec(
      makeConfig({
        strategy: 'viewport',
        routes: [{ path: '/a', chunkPath: '/assets/a.js', css: ['/assets/a.css'], reason: '' }],
      }),
    )
    vi.advanceTimersByTime(2000)
    expect(prefetchLinks()).toHaveLength(0) // 视口模式不主动注入

    document.querySelector('a')!.dispatchEvent(new Event('pointerover', { bubbles: true }))
    expect(prefetchLinks().map((l) => l.getAttribute('href')).sort()).toEqual(
      ['/assets/a.css', '/assets/a.js'].sort(),
    )

    // 幂等：重复 hover 不重复注入
    document.querySelector('a')!.dispatchEvent(new Event('pointerover', { bubbles: true }))
    expect(prefetchLinks()).toHaveLength(2)
  })

  it('stats：预取完成后点击目标链接计为 hit，未预取计为 miss', () => {
    document.body.innerHTML = '<a href="/a">A</a><a href="/b">B</a>'
    exec(
      makeConfig({
        debug: true,
        routes: [
          { path: '/a', chunkPath: '/assets/a.js', reason: '' },
          { path: '/b', chunkPath: '/assets/b.js', reason: '' },
        ],
      }),
    )
    vi.advanceTimersByTime(2000)
    // 只让 /a 落定；/b 保持未完成 → 点击 /a 计 hit、点击 /b 计 miss
    prefetchLinks().filter((l) => l.href.includes('a.js')).forEach(settle)

    document.querySelectorAll('a')[0].dispatchEvent(new Event('click', { bubbles: true }))
    document.querySelectorAll('a')[1].dispatchEvent(new Event('click', { bubbles: true }))
    const dbg = (window as unknown as { __preloaderDebug: { stats: () => unknown } }).__preloaderDebug
    expect(dbg.stats()).toEqual({ prefetched: 1, hits: 1, misses: 1 })
  })
})
