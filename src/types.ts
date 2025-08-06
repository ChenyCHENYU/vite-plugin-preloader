export interface PreloadRoute {
  path: string
  component?: string
  reason?: string
  priority?: number
}

export interface PreloaderOptions {
  routes: (string | PreloadRoute)[]
  delay?: number
  showStatus?: boolean
  statusPosition?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  debug?: boolean
}