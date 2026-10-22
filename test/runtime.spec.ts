// ============================================================================
// 🧪 test/runtime.spec.ts - 运行时脚本生成单元测试
// 覆盖：build/dev 注入策略、strategy（all 分批 / viewport 视口）、
//       空路由零注入、JSON 转义
// ============================================================================
import { describe, it, expect } from 'vitest'
import { buildRuntimeScript } from '../src/runtime'
import type { RuntimeConfig } from '../src/runtime'

function makeConfig(over: Partial<RuntimeConfig> = {}): RuntimeConfig {
  return {
    delay: 2000,
    debug: false,
    showStatus: false,
    statusPosition: 'bottom-right',
    strategy: 'all',
    isBuild: false,
    routes: [{ path: '/a', chunkPath: null, reason: '测试' }],
    ...over,
  }
}

describe('buildRuntimeScript', () => {
  it('无路由 → 零注入（dev 与 build 一致）', () => {
    expect(buildRuntimeScript(makeConfig({ routes: [] }))).toBe('')
    expect(buildRuntimeScript(makeConfig({ routes: [], isBuild: true }))).toBe('')
  })

  it('dev 且 status/debug 全关 → 零注入', () => {
    expect(buildRuntimeScript(makeConfig())).toBe('')
  })

  it('build 且 status/debug 全关 → 仍产出 prefetch 注入器（最小体积）', () => {
    const script = buildRuntimeScript(makeConfig({ isBuild: true }))
    expect(script).toContain("l.rel='prefetch'")
    expect(script).toContain("document.createElement('link')")
    expect(script).not.toContain('__preloader_ui__')
  })

  it('build all 模式：按批次注入（BATCH=4 + 8s 兜底放行）', () => {
    const script = buildRuntimeScript(
      makeConfig({ isBuild: true, routes: [{ path: '/a', chunkPath: '/assets/a.js', reason: '' }] }),
    )
    expect(script).toContain('var BATCH=4')
    expect(script).toContain('injectBatch')
    expect(script).toContain('8000')
    expect(script).not.toContain('IntersectionObserver')
  })

  it('build viewport 模式：IO + pointerover 委托，无全量注入', () => {
    const script = buildRuntimeScript(
      makeConfig({ isBuild: true, strategy: 'viewport', routes: [{ path: '/a', chunkPath: '/assets/a.js', reason: '' }] }),
    )
    expect(script).toContain('IntersectionObserver')
    expect(script).toContain("addEventListener('pointerover'")
    expect(script).not.toContain('injectBatch')
  })

  it('build 注入器包含带 chunkPath 的路由数据', () => {
    const script = buildRuntimeScript(
      makeConfig({ isBuild: true, routes: [{ path: '/a', chunkPath: '/app/assets/a-B2x.js', reason: '' }] }),
    )
    expect(script).toContain('/app/assets/a-B2x.js')
  })

  it('dev 模式不含 prefetch 注入器，仅状态/调试', () => {
    const script = buildRuntimeScript(makeConfig({ showStatus: true, debug: true }))
    expect(script).not.toContain("l.rel='prefetch'")
    expect(script).toContain('__preloader_ui__')
    expect(script).toContain('__preloaderDebug')
    expect(script).toContain('modulepreload')
  })

  it('内嵌 JSON 转义 <，防 </script> 逃逸', () => {
    const script = buildRuntimeScript(
      makeConfig({
        isBuild: true,
        routes: [{ path: '/a', chunkPath: '/assets/a.js', reason: '</script><script>alert(1)</script>' }],
      }),
    )
    expect(script).not.toContain('</script><script>')
    // 脚本自身的闭合标签除外：以最后一个 </script> 结尾
    expect(script.trim().endsWith('</script>')).toBe(true)
  })

  it('非法 statusPosition 回退到 bottom-right', () => {
    const script = buildRuntimeScript(
      makeConfig({ showStatus: true, statusPosition: 'middle' as RuntimeConfig['statusPosition'] }),
    )
    expect(script).toContain('bottom:16px;right:16px')
  })
})
