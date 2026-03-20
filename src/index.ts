// ============================================================================
// 🚀 src/index.ts - 插件入口
// v2 核心改动：
//   1. configResolved(config) 正确读取 alias/root/command
//   2. generateBundle hook 扫描 Rollup bundle 匹配真实 chunk 路径
//   3. transformIndexHtml 注入 <link rel="prefetch"> 到 </body> 前
//   4. routes 完整防御校验，防止 undefined/非数组崩溃
//   5. 移除无效的运行时 import() 动态加载逻辑
//   6. 去掉无用的 vue peerDep，apply 区分 SSR 场景
// ============================================================================
import type { Plugin, ResolvedConfig } from "vite";
import type { PreloaderOptions, ResolvedRoute } from "./types";
import { CodeGenerator } from "./generator";

export default function preloaderPlugin(
  userOptions: PreloaderOptions = {},
): Plugin {
  // 合并默认配置，所有字段都有明确默认值，routes 防御校验确保始终为数组
  const options: Required<PreloaderOptions> = {
    routes: Array.isArray(userOptions.routes) ? userOptions.routes : [],
    delay: userOptions.delay ?? 2000,
    debug: userOptions.debug ?? process.env.NODE_ENV !== 'production',
    showStatus: userOptions.showStatus ?? true,
    statusPosition: userOptions.statusPosition ?? 'bottom-right',
    exclude: userOptions.exclude ?? [],
  };

  const generator = new CodeGenerator(options);
  let resolvedRoutes: ResolvedRoute[] = [];
  let isBuild = false;

  return {
    name: "vite-plugin-preloader",

    // post 确保在其他插件（如 @vitejs/plugin-vue）处理完后执行
    enforce: "post",

    // SSR 构建时不注入客户端预加载脚本
    apply(_, { isSsrBuild }) {
      return !isSsrBuild;
    },

    // ✅ 正确读取 viteConfig：alias、root、command
    configResolved(config: ResolvedConfig) {
      isBuild = config.command === "build";
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
            '   开发模式：注入 <link rel="modulepreload">，生产构建后切换为 <link rel="prefetch">',
          );
        }
      }
    },

    // ✅ 生产构建阶段：扫描 bundle，为路由匹配真实 chunk hash 路径
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    generateBundle(_opts: unknown, bundle: Record<string, any>) {
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
            `   ⚠️  未找到 chunk：${r.path} → ${r.component}（组件路径可能不匹配）`,
          );
        });
      }
    },

    // ✅ 注入 <link> 标签 + 可选运行时脚本到 </body> 前
    transformIndexHtml(html: string) {
      const linkTags = generator.generateLinkTags(resolvedRoutes, isBuild);
      const runtimeScript = generator.generateRuntimeScript(
        resolvedRoutes,
        isBuild,
      );

      const inject = [linkTags, runtimeScript].filter(Boolean).join("\n");
      if (!inject) return html;

      // 注入到 </body> 前（脚本依赖 DOM 和 Vue 已挂载）
      if (html.includes("</body>")) {
        return html.replace("</body>", `${inject}\n</body>`);
      }
      // 兜底：追加到末尾
      return html + "\n" + inject;
    },

    // HMR：vite.config 变更时触发完整刷新
    handleHotUpdate(ctx) {
      if (ctx.file.includes("vite.config")) {
        ctx.server.ws.send({ type: "full-reload" });
        return [];
      }
      return undefined;
    },
  };
}

// 命名导出，支持多种导入方式
export {
  type PreloaderOptions,
  type PreloadRoute,
  type StatusPosition,
} from "./types";
