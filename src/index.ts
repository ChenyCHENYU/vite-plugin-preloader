// ============================================================================
// 🚀 src/index.ts - 插件入口
// v2.1 核心改动：
//   1. 生产模式在 generateBundle 里直改 HTML asset source——transformIndexHtml
//      在 build 时由 vite:build-html 调起，早于本插件的 generateBundle，
//      永远拿不到 chunk 匹配结果（v2.0.x 因此生产一条 prefetch 都注入不了）
//   2. transformIndexHtml 仅服务 dev：静态注入 modulepreload + 运行时脚本
//   3. debug 默认值由 command 决定（NODE_ENV 在配置加载期不可靠）
//   4. 移除无效的 handleHotUpdate（Vite 对 config 变更本就自动重启）
// ============================================================================
import type { Plugin, ResolvedConfig } from "vite";
import type { PreloaderOptions, ResolvedRoute } from "./types";
import { CodeGenerator } from "./generator";
import type { OutputBundleCompat } from "./generator";

export default function preloaderPlugin(
  userOptions: PreloaderOptions = {},
): Plugin {
  // 合并默认配置，所有字段都有明确默认值，routes 防御校验确保始终为数组
  // debug 默认值依赖 command，先占位、在 configResolved 中最终确定
  const options: Required<PreloaderOptions> = {
    routes: Array.isArray(userOptions.routes) ? userOptions.routes : [],
    delay: userOptions.delay ?? 2000,
    debug: userOptions.debug ?? false,
    showStatus: userOptions.showStatus ?? true,
    statusPosition: userOptions.statusPosition ?? 'bottom-right',
    exclude: userOptions.exclude ?? [],
    strategy: userOptions.strategy ?? 'all',
  };

  const generator = new CodeGenerator(options);
  let resolvedRoutes: ResolvedRoute[] = [];
  let isBuild = false;
  // dev 注入片段缓存：routes 在 configResolved 后不再变化，避免每个请求重算
  let devInjectCache: string | null = null;

  return {
    name: "vite-plugin-preloader",

    // post 确保在其他插件（如 @vitejs/plugin-vue）处理完后执行
    enforce: "post",

    // SSR 构建时不注入客户端预加载脚本
    apply(_, { isSsrBuild }) {
      return !isSsrBuild;
    },

    configResolved(config: ResolvedConfig) {
      isBuild = config.command === "build";
      options.debug = userOptions.debug ?? !isBuild;
      generator.setViteConfig(config);
      resolvedRoutes = generator.resolveRoutes();

      if (options.debug) {
        const total = Array.isArray(userOptions.routes)
          ? userOptions.routes.length
          : 0;
        const filtered = total - resolvedRoutes.length;
        console.log(
          `🚀 [预加载插件 v2] 已启用，${resolvedRoutes.length} 个路由待预加载` +
            (filtered > 0 ? `（已过滤 ${filtered} 个动态/排除路由）` : ""),
        );
        if (!isBuild) {
          console.log(
            '   开发模式：注入 <link rel="modulepreload">，生产构建由运行时脚本在 load 后注入 <link rel="prefetch">',
          );
        }
        // 浏览器 prefetch 缓存总量有限（Chrome 约数十条且按 LRU 逐出），路由过多会互相挤掉
        if (resolvedRoutes.length > 12) {
          console.warn(
            `   ⚠️  预加载路由达 ${resolvedRoutes.length} 个：prefetch 缓存有限，建议精简到 12 个以内（保留高频入口），或改用 strategy: 'viewport' 按需预取`,
          );
        }
      }
    },

    // 仅 dev：modulepreload 静态注入 + 状态/调试脚本
    // build 时 HTML 由 generateBundle 直改 asset（见下），此处直通返回
    transformIndexHtml(html: string) {
      if (isBuild) return html;

      if (devInjectCache === null) {
        devInjectCache = [
          generator.generateLinkTags(resolvedRoutes),
          generator.generateRuntimeScript(resolvedRoutes, isBuild),
        ]
          .filter(Boolean)
          .join("\n");
      }
      if (!devInjectCache) return html;

      return generator.injectIntoHtml(html, devInjectCache);
    },

    // 生产构建阶段：
    //   1. 扫描 bundle，为路由匹配真实 chunk hash 路径（含 base）
    //   2. 把运行时脚本（prefetch 注入器 + 可选状态/调试）写进所有 HTML asset
    generateBundle(_opts: unknown, bundle: OutputBundleCompat) {
      if (!isBuild) return;
      resolvedRoutes = generator.fillChunkPaths(resolvedRoutes, bundle);

      if (options.debug) {
        const matched = resolvedRoutes.filter((r) => r.chunkPath).length;
        const unmatched = resolvedRoutes.filter((r) => !r.chunkPath);
        console.log(
          `📦 [预加载插件 v2] bundle 扫描完成：${matched}/${resolvedRoutes.length} 个路由成功匹配 chunk`,
        );
        unmatched.forEach((r) => {
          console.warn(
            `   ⚠️  未找到 chunk：${r.path} → ${r.component}（组件路径可能不匹配，或组件未使用动态 import 而无独立 chunk）`,
          );
        });
      }

      const runtimeScript = generator.generateRuntimeScript(resolvedRoutes, isBuild);
      if (!runtimeScript) return;

      for (const asset of Object.values(bundle)) {
        if (asset.type !== "asset" || !asset.fileName?.endsWith(".html")) continue;
        const wasBinary = typeof asset.source !== "string";
        const html = wasBinary
          ? Buffer.from(asset.source as Uint8Array).toString("utf8")
          : (asset.source as string);
        const next = generator.injectIntoHtml(html, runtimeScript);
        asset.source = wasBinary ? new Uint8Array(Buffer.from(next, "utf8")) : next;
      }
    },
  };
}

// 命名导出，支持多种导入方式
export {
  type PreloaderOptions,
  type PreloadRoute,
  type PreloadStrategy,
  type StatusPosition,
} from "./types";
