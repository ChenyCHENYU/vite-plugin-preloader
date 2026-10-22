export interface PreloadRoute {
  /** 路由路径，如 /dashboard。含 :param 的动态路由会被自动过滤 */
  path: string;
  /**
   * 可选。组件文件路径，支持三种写法：
   *   '@/views/xxx.vue'（@ 别名）、'/src/views/xxx.vue'（项目根相对）、绝对路径。
   * 相对当前页面的写法会被归一为项目根相对，避免嵌套路由下解析错误。
   * 不填则自动推断为 @/views/{path}/index.vue
   */
  component?: string;
  /** 备注说明，仅用于日志显示 */
  reason?: string;
  /** 优先级，数字越小越先注入（prefetch 由浏览器统一调度，不改变网络优先级），默认 2 */
  priority?: number;
}

export type StatusPosition =
  | "bottom-right"
  | "bottom-left"
  | "top-right"
  | "top-left";

/** 生产预取策略 */
export type PreloadStrategy = "all" | "viewport";

export interface PreloaderOptions {
  /**
   * 要预加载的路由列表，支持字符串或对象格式
   * 含 :param 的动态路由段会被自动过滤
   * 默认 []
   */
  routes?: (string | PreloadRoute)[];
  /**
   * 页面 load 完成后延迟多少毫秒再发起生产 prefetch（省流/2G 网络自动跳过）；
   * 开发模式下仅延迟状态角标显示，modulepreload 仍随 HTML 立即注入
   * 默认 2000ms
   */
  delay?: number;
  /**
   * 是否开启调试日志与 window.__preloaderDebug 调试工具
   * 默认：开发环境 true，生产环境 false
   */
  debug?: boolean;
  /**
   * 是否在页面角落显示预加载状态提示
   * 默认 true
   */
  showStatus?: boolean;
  /**
   * 状态提示的显示位置
   * 默认 'bottom-right'
   */
  statusPosition?: StatusPosition;
  /**
   * 要排除预加载的路由路径列表（精确匹配或前缀匹配）
   * 例：['/404', '/login', '/admin']
   */
  exclude?: string[];
  /**
   * 生产预取策略：
   * - 'all'（默认）：load + delay 后按 priority 分批（每批 4 个）prefetch 全部配置路由
   * - 'viewport'：只预取视口内 / 即将点击的 <a href> 对应路由（quicklink 风格，
   *   IntersectionObserver + pointerover 委托，SPA 动态渲染的链接天然覆盖）
   * 开发模式不受此选项影响（modulepreload 始终全量静态注入）
   */
  strategy?: PreloadStrategy;
}

/** 内部解析后的路由对象（带可选的生产 chunk 文件路径） */
export interface ResolvedRoute {
  path: string;
  component: string;
  /** 生产构建时填充，为实际输出的 chunk 文件相对 URL，如 /assets/Dashboard-Cx8K.js */
  chunkPath?: string;
  /** 生产构建时填充，该路由组件引入的 CSS 产物 URL（cssCodeSplit 拆分场景） */
  cssPaths?: string[];
  /** 生产构建时填充，chunk 代码体积（字节），同 priority 时小者先预取 */
  bytes?: number;
  reason: string;
  priority: number;
}