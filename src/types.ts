export interface PreloadRoute {
  /** 路由路径，如 /dashboard。含 :param 的动态路由会被自动过滤 */
  path: string;
  /** 可选。组件文件路径，不填则自动推断为 @/views/{path}/index.vue */
  component?: string;
  /** 备注说明，仅用于日志显示 */
  reason?: string;
  /** 优先级，数字越小越优先加载，默认 2 */
  priority?: number;
}

export type StatusPosition =
  | "bottom-right"
  | "bottom-left"
  | "top-right"
  | "top-left";

export interface PreloaderOptions {
  /**
   * 要预加载的路由列表，支持字符串或对象格式
   * 含 :param 的动态路由段会被自动过滤
   * 默认 []
   */
  routes?: (string | PreloadRoute)[];
  /**
   * 页面加载完成后延迟多少毫秒再触发状态显示
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
}

/** 内部解析后的路由对象（带可选的生产 chunk 文件路径） */
export interface ResolvedRoute {
  path: string;
  component: string;
  /** 生产构建时填充，为实际输出的 chunk 文件相对 URL，如 /assets/Dashboard-Cx8K.js */
  chunkPath?: string;
  reason: string;
  priority: number;
}