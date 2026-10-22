// ============================================================================
// 🧪 test/e2e-build.spec.ts - 生产构建端到端测试
// 用 vite build API 真实构建 fixture，断言产物 HTML：
//   1. 运行时脚本已注入（generateBundle 直改 HTML asset，v2.0.x 的
//      transformIndexHtml 顺序 bug 正是这里漏掉了全部注入）
//   2. chunkPath 携带 base 与真实 hash
//   3. 不再静态注入 <link rel="prefetch">（由运行时 load+delay 后创建）
//   4. :param 动态路由被过滤
// 注：root 取 realpath——vite:build-html 在 symlink root 下 emit HTML 会
// 报相对路径错误（Vite 8.0.1 自身行为）；本插件对 symlink 的容错
// 由 generator.spec.ts 的 fillChunkPaths 单测覆盖
// ============================================================================
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { build } from 'vite'
import preloader from '../src/index'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

let root: string
let outDir: string

beforeAll(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'vpp-e2e-')))
  outDir = path.join(root, 'dist')
  fs.mkdirSync(path.join(root, 'src/views/a'), { recursive: true })
  fs.mkdirSync(path.join(root, 'src/views/b'), { recursive: true })
  fs.mkdirSync(path.join(root, 'src/views/c'), { recursive: true })
  fs.writeFileSync(path.join(root, 'index.html'), '<!doctype html><html><head></head><body><script type="module" src="/src/main.js"></script></body></html>')
  fs.writeFileSync(path.join(root, 'src/views/a/index.js'), 'export default "A"')
  fs.writeFileSync(path.join(root, 'src/views/b/index.js'), 'export default "B"')
  fs.writeFileSync(path.join(root, 'src/views/c/style.css'), '.c{color:red}')
  fs.writeFileSync(path.join(root, 'src/views/c/index.js'), "import './style.css'\nexport default \"C\"")
  fs.writeFileSync(
    path.join(root, 'src/main.js'),
    "import('./views/a/index.js')\nimport('./views/b/index.js')\nimport('./views/c/index.js')\n",
  )
})

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

describe('vite build e2e', () => {
  it(
    '生产 HTML 注入运行时 prefetch 数据（智能匹配 + base + hash + 动态路由过滤）',
    async () => {
      await build({
        root,
        configFile: false,
        base: '/app/',
        logLevel: 'warn',
        resolve: { alias: [{ find: '@', replacement: path.join(root, 'src') }] },
        plugins: [
          preloader({
            // 不传 component：默认推断 index.vue 会 miss，
            // 智能候选（views/a/index.js）应自动命中真实 chunk
            routes: [
              { path: '/a' },
              { path: '/b/:id' }, // 动态路由应被过滤
              { path: '/c' }, // 带 CSS 的路由：样式产物应随路由一起预取
            ],
            debug: false,
            showStatus: false,
          }),
        ],
        build: { outDir, emptyOutDir: true },
      })

      const html = fs.readFileSync(path.join(outDir, 'index.html'), 'utf8')
      const assets = fs.readdirSync(path.join(outDir, 'assets'))
      const aChunk = assets.find((f) => /^a-.*\.js$/.test(f))

      // 运行时脚本注入成功（v2.0.x 顺序 bug 会在这里全部缺失）
      expect(html).toContain('vite-plugin-preloader v2 - prefetch injector')
      // 智能匹配命中：chunkPath 携带 base 与真实 hash 文件名
      expect(aChunk).toBeTruthy()
      expect(html).toContain(`/app/assets/${aChunk}`)
      // 静态 HTML 不含 prefetch link（由运行时 load+delay 后创建）
      expect(html).not.toMatch(/<link rel="prefetch"/)
      // :param 路由被过滤，b 的 chunk 不出现在数据里
      const bChunk = assets.find((f) => /^b-.*\.js$/.test(f))
      expect(html).not.toContain('"/b/:id"')
      expect(bChunk ? html.includes(`/app/assets/${bChunk}`) : false).toBe(false)
      // c 路由的 CSS 产物进入预取数据（cssCodeSplit 拆分场景）
      const cCss = assets.find((f) => /^c-.*\.css$/.test(f))
      expect(cCss).toBeTruthy()
      expect(html).toContain(`/app/assets/${cCss}`)
    },
    120_000,
  )
})
