export interface PreloadRoute {
  path: string
  component?: string
  reason?: string
  priority?: number
}

export interface PreloaderOptions {
  routes: (string | PreloadRoute)[];
  delay?: number;
  debug?: boolean;
}