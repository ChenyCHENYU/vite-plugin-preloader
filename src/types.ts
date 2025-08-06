// ============================================================================
// 📝 src/types.ts - 类型定义
// ============================================================================

export interface PreloadRoute {
  /** 路由路径 */
  path: string
  /** 组件导入路径，不填则自动推断 */
  component?: string
  /** 预加载原因说明 */
  reason?: string
  /** 优先级 1-5，数字越小优先级越高 */
  priority?: number
}

export interface PreloaderOptions {
  /** 预加载路由配置 - 支持字符串数组或对象数组 */
  routes: (string | PreloadRoute)[]
  /** 延迟时间（毫秒），默认 2000 */
  delay?: number
  /** 是否显示预加载状态，默认 true */
  showStatus?: boolean
  /** 状态显示位置，默认 'bottom-right' */
  statusPosition?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  /** 是否启用开发时调试，默认 false */
  debug?: boolean
  /** 自动检测大文件并预加载（未来功能） */
  autoDetect?: {
    /** 最小文件大小阈值 */
    minSize?: string
    /** 排除的路径模式 */
    exclude?: string[]
  }
}