// ============================================================================
// ⚡ src/runtime.ts - 运行时状态 UI 脚本生成
// 核心预加载由构建时注入的 <link rel="prefetch"> 标签完成（浏览器原生调度）
// 本模块仅负责生成可选的状态显示和调试工具脚本
// ============================================================================

export interface RuntimeConfig {
  delay: number
  debug: boolean
  showStatus: boolean
  statusPosition: string
  routes: Array<{ path: string; chunkPath: string | null; reason: string }>
  isBuild: boolean
}

const STATUS_STYLES: Record<string, string> = {
  'bottom-right': 'bottom:16px;right:16px',
  'bottom-left': 'bottom:16px;left:16px',
  'top-right': 'top:16px;right:16px',
  'top-left': 'top:16px;left:16px',
}

/**
 * 生成运行时内联脚本字符串
 * 负责：网络感知判断、状态 UI 展示、prefetch link 进度监听、debug 工具挂载
 */
export function buildRuntimeScript(config: RuntimeConfig): string {
  const posStyle = STATUS_STYLES[config.statusPosition] ?? STATUS_STYLES['bottom-right']
  const configJson = JSON.stringify(config)

  // 状态 UI 代码（仅 showStatus=true 时注入）
  const statusUiCode = config.showStatus
    ? `
  function showStatus(){
    var links=document.querySelectorAll('link[data-preloader]');
    if(!links.length)return;
    var el=document.createElement('div');
    el.id='__preloader_ui__';
    el.style.cssText='position:fixed;${posStyle};z-index:2147483647;'
      +'background:rgba(15,15,15,0.82);color:#fff;font-size:12px;line-height:1.5;'
      +'padding:7px 14px;border-radius:20px;pointer-events:none;'
      +'transition:opacity 0.4s ease;font-family:system-ui,-apple-system,sans-serif;'
      +'backdrop-filter:blur(4px);box-shadow:0 2px 8px rgba(0,0,0,0.3);';
    el.textContent='⚡ 正在优化 '+links.length+' 个页面...';
    document.body&&document.body.appendChild(el);
    var done=0,total=links.length;
    function tick(){
      done++;
      el.textContent=done>=total?'✅ 页面优化完成（'+total+'个）':'⚡ 优化中 '+done+'/'+total+'...';
      if(done>=total){
        setTimeout(function(){
          el.style.opacity='0';
          setTimeout(function(){el&&el.parentNode&&el.parentNode.removeChild(el);},420);
        },2200);
      }
    }
    links.forEach(function(l){l.addEventListener('load',tick);l.addEventListener('error',tick);});
    setTimeout(function(){el&&el.parentNode&&el.parentNode.removeChild(el);},9000);
  }
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',function(){setTimeout(showStatus,C.delay);});
  }else{
    setTimeout(showStatus,C.delay);
  }`
    : ''

  // debug 工具代码
  const debugCode = config.debug
    ? `
  console.group('%c🚀 vite-plugin-preloader v2','color:#4ade80;font-weight:700');
  console.log('已注入 '+C.routes.length+' 个 <link rel=\\"prefetch\\"> 标签（浏览器原生调度）');
  C.routes.forEach(function(r){
    var ok=r.chunkPath;
    console.log((ok?'✅ ':'⚠️  ')+r.path+(ok?' → '+r.chunkPath:' (chunk 未匹配，仅开发环境有效)')+(r.reason?' | '+r.reason:''));
  });
  console.groupEnd();
  window.__preloaderDebug={
    routes:C.routes,
    check:function(p){return C.routes.some(function(r){return r.path===p&&!!r.chunkPath;})},
    help:function(){console.log('__preloaderDebug: .routes | .check(path)');}
  };
  console.log('%c🛠 调试: window.__preloaderDebug','color:#94a3b8;font-size:11px');`
    : ''

  if (!statusUiCode && !debugCode) return ''

  return `<script>/* vite-plugin-preloader v2 - status/debug */
(function(){
  var C=${configJson};
  var conn=navigator.connection||navigator.mozConnection||navigator.webkitConnection;
  if(conn&&(conn.saveData||['slow-2g','2g'].indexOf(conn.effectiveType)>=0)){
    if(C.debug)console.warn('[预加载] 检测到省流/低速网络，跳过状态显示');
    return;
  }
  ${debugCode}
  ${statusUiCode}
})();
</script>`
}