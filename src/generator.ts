// ============================================================================
// 🛠️ src/generator.ts - 代码生成器
// ============================================================================
import type { PreloaderOptions } from './types'
import { runtimeTemplate } from './runtime'

export class CodeGenerator {
  constructor(private options: PreloaderOptions) {}

  /**
   * 生成运行时代码
   */
  generateRuntime(): string {
    const routes = this.processRoutes();
    const options = this.processOptions();

    return runtimeTemplate
      .replace("__PRELOAD_ROUTES__", JSON.stringify(routes, null, 2))
      .replace("__PRELOAD_OPTIONS__", JSON.stringify(options, null, 2));
  }

  /**
   * 处理路由配置
   */
  private processRoutes(): any[] {
    return this.options.routes.map((route) => {
      // 处理字符串输入
      if (typeof route === "string") {
        const componentPath = this.inferComponentPath(route);
        return {
          path: route,
          component: componentPath,
          reason: "自动推断的预加载页面",
          priority: 2,
        };
      }

      // 处理对象输入
      const componentPath =
        route.component || this.inferComponentPath(route.path);
      return {
        path: route.path,
        component: componentPath,
        reason: route.reason || "用户配置的预加载页面",
        priority: route.priority || 2,
      };
    });
  }

  /**
   * 处理选项配置
   */
  private processOptions() {
    // 智能默认配置
    const isDev = process.env.NODE_ENV !== "production";

    return {
      delay: this.options.delay ?? 2000, // 默认2秒
      showStatus: this.options.showStatus ?? true, // 默认显示状态
      statusPosition: this.options.statusPosition ?? "bottom-right", // 默认右下角
      debug: this.options.debug ?? isDev, // 开发环境默认开启调试，生产环境默认关闭
    };
  }

  /**
   * 推断组件路径 - 使用 Vite 别名格式
   */
  private inferComponentPath(routePath: string): string {
    const cleanPath = routePath.replace(/^\//, "");

    // 直接使用 @ 别名，这在 Vite 构建后会被正确解析
    if (cleanPath.startsWith("demo/")) {
      // /demo/13-calendar -> @/views/demo/13-calendar/index.vue
      return `@/views/${cleanPath}/index.vue`;
    }

    // 其他路径的处理
    const pathSegments = cleanPath.split("/");
    return `@/views/${pathSegments.join("/")}/index.vue`;
  }

  /**
   * 生成注入到 HTML 头部的脚本
   */
  generateHtmlInject(): string {
    return `<script type="module">
${this.generateRuntime()}
</script>`;
  }
}