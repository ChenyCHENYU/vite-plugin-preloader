// ============================================================================
// ⚡ src/runtime.ts - 运行时脚本生成
// v2.3 核心改动：
//   1. 路由关联 CSS 预取：JS chunk 与其 CSS 产物成组预取（as=style），
//      点击切换时不再现拉样式
//   2. debug 命中率观测：__preloaderDebug.stats() 返回预取完成数与
//      点击命中/未命中计数（仅 debug 时注入，零生产开销）
//   3. 预取粒度=路由：每路由的 JS+CSS 全部落定才计入下一批/进度
// v2.2：strategy='all' 按 priority 分批（每批 4 个、8s 兜底放行）；
//       strategy='viewport' 视口/悬停预取（IO + pointerover 委托）
// v2.1：生产 prefetch 由本脚本在 load + delay 后注入，省流/2G 跳过
// ============================================================================
import type { StatusPosition, PreloadStrategy } from './types'

export interface RuntimeConfig {
  delay: number
  debug: boolean
  showStatus: boolean
  statusPosition: StatusPosition
  strategy: PreloadStrategy
  isBuild: boolean
  routes: Array<{ path: string; chunkPath: string | null; css?: string[]; reason: string }>
}

const STATUS_STYLES: Record<StatusPosition, string> = {
  'bottom-right': 'bottom:16px;right:16px',
  'bottom-left': 'bottom:16px;left:16px',
  'top-right': 'top:16px;right:16px',
  'top-left': 'top:16px;left:16px',
}

/**
 * 生成运行时内联脚本字符串
 * 无路由 → 空串；dev 且 status/debug 全关 → 空串（零注入）；
 * 生产始终包含 prefetch 注入器（按 strategy 选择全量分批 / 视口模式）
 */
export function buildRuntimeScript(config: RuntimeConfig): string {
  if (!config.routes.length) return ''
  if (!config.isBuild && !config.showStatus && !config.debug) return ''

  const posStyle = STATUS_STYLES[config.statusPosition] ?? STATUS_STYLES['bottom-right']
  const configJson = JSON.stringify(config).replace(/</g, '\\u003c')

  const statusUiCode = config.showStatus
    ? `
  function doneCount(links){
    try{
      var seen={},es=window.performance&&performance.getEntriesByType?performance.getEntriesByType('resource'):[];
      for(var i=0;i<es.length;i++)seen[es[i].name]=1;
      var n=0;
      for(var j=0;j<links.length;j++)if(seen[links[j].href])n++;
      return n;
    }catch(_){return 0}
  }
  var uiEl=null,done=0,total=0;
  function label(){
    if(total&&done>=total)return '✅ 页面优化完成（'+total+'个）';
    if(!done)return '⚡ 正在优化 '+(total||'')+' 个页面...';
    return total?'⚡ 优化中 '+done+'/'+total+'...':'✅ 已预取 '+done+' 个页面';
  }
  function showStatusUI(links,totalCount){
    if(!links.length&&!totalCount)return;
    total=totalCount||links.length;
    done=totalCount?0:doneCount(links);
    uiEl=document.createElement('div');
    uiEl.id='__preloader_ui__';
    uiEl.style.cssText='position:fixed;${posStyle};z-index:2147483647;'
      +'background:rgba(15,15,15,0.82);color:#fff;font-size:12px;line-height:1.5;'
      +'padding:7px 14px;border-radius:20px;pointer-events:none;'
      +'transition:opacity 0.4s ease;font-family:system-ui,-apple-system,sans-serif;'
      +'backdrop-filter:blur(4px);box-shadow:0 2px 8px rgba(0,0,0,0.3);';
    uiEl.textContent=label();
    document.body&&document.body.appendChild(uiEl);
    setTimeout(function(){uiEl&&uiEl.parentNode&&uiEl.parentNode.removeChild(uiEl);},9000);
  }
  function tick(){
    done++;
    if(!uiEl)return;
    uiEl.textContent=label();
    if(total&&done>=total){
      setTimeout(function(){
        if(!uiEl)return;
        uiEl.style.opacity='0';
        setTimeout(function(){uiEl&&uiEl.parentNode&&uiEl.parentNode.removeChild(uiEl);},420);
      },2200);
    }
  }`
    : ''

  // 命中率观测（debug-only）：点击链接时统计目标路由 chunk 是否已预取完成
  // 非 debug 时保留空 markDone，oneLink 统一调用（避免引用未定义变量）
  const statsCode = config.debug
    ? `
  var doneUrls={},hits=0,misses=0;
  function markDone(u,ok){if(ok)doneUrls[u]=1;}
  function normD(p){return('/'+String(p).replace(/^\\/+/,'').replace(/\\/+$/,'').replace(/\\/{2,}/g,'/'))}
  function routeOf(p){
    for(var i=0;i<C.routes.length;i++)if(normD(C.routes[i].path)===normD(p))return C.routes[i];
    return null;
  }
  document.addEventListener('click',function(ev){
    var t=ev.target,a=t&&t.closest?t.closest('a[href]'):null;
    if(!a)return;
    try{
      var u=new URL(a.getAttribute('href'),location.href);
      if(u.origin!==location.origin)return;
      var r=routeOf(u.pathname);
      if(!r||!r.chunkPath)return;
      if(doneUrls[r.chunkPath])hits++;else misses++;
    }catch(_){}
  },true);`
    : `
  function markDone(){}`

  const debugCode = config.debug
    ? `
  function logInjected(n){
    console.group('%c🚀 vite-plugin-preloader v2','color:#4ade80;font-weight:700');
    console.log((C.isBuild?'页面 load 后 '+C.delay+'ms ':'已 ')+C.strategy+' 模式注入 '+n+' 个 <link rel=\"'+(C.isBuild?'prefetch':'modulepreload')+'\">');
    C.routes.forEach(function(r){
      var ok=r.chunkPath;
      console.log((ok?'✅ ':'⚠️  ')+r.path+(ok?' → '+r.chunkPath+(r.css&&r.css.length?'（+'+r.css.length+' CSS）':''):' (chunk 未匹配，仅开发环境有效)')+(r.reason?' | '+r.reason:''));
    });
    console.groupEnd();
    window.__preloaderDebug={
      routes:C.routes,
      check:function(p){return C.routes.some(function(r){return r.path===p&&!!r.chunkPath;})},
      stats:function(){return {prefetched:Object.keys(doneUrls).length,hits:hits,misses:misses}},
      help:function(){console.log('__preloaderDebug: .routes | .check(path) | .stats()');}
    };
    console.log('%c🛠 调试: window.__preloaderDebug','color:#94a3b8;font-size:11px');
  }`
    : ''

  const initCode = config.isBuild
    ? buildInitCode(config)
    : devInitCode({ statusUiCode, debugCode })

  // 预取工厂仅生产需要（dev 的 link 已静态存在）
  const factoryCode = config.isBuild
    ? `
  function oneLink(href,as,cross,onSettled){
    var l=document.createElement('link');
    l.rel='prefetch';l.as=as;
    if(cross)l.crossOrigin='';
    l.href=href;
    if(onSettled){l.addEventListener('load',function(){markDone(href,true);onSettled();});l.addEventListener('error',function(){markDone(href,false);onSettled();});}
    return l;
  }
  // 一个路由 = JS chunk + 关联 CSS，全部落定才回调 onRoute（驱动批次与进度）
  function makeRouteLinks(r,onRoute){
    var hrefs=[r.chunkPath].concat(r.css||[]);
    var pending=hrefs.length,ls=[];
    function dec(){if(!--pending&&onRoute)onRoute();}
    hrefs.forEach(function(h,i){
      var l=oneLink(h,i?'style':'script',!i,dec);
      ls.push(l);links.push(l);
    });
    return ls;
  }`
    : ''

  return `<script>/* vite-plugin-preloader v2 - prefetch injector & status */
(function(){
  var C=${configJson};
  var conn=navigator.connection||navigator.mozConnection||navigator.webkitConnection;
  var slow=!!(conn&&(conn.saveData||['slow-2g','2g'].indexOf(conn.effectiveType)>=0));
  var Q=[];C.routes.forEach(function(r){if(r.chunkPath)Q.push(r)});
  var links=[];
  ${factoryCode}
  ${statsCode}
  ${debugCode}
  ${statusUiCode}
${initCode}
  if(document.readyState==='complete'){setTimeout(init,C.delay);}
  else{window.addEventListener('load',function(){setTimeout(init,C.delay);});}
})();
</script>`
}

/** 生产 'all'：分批注入；生产 'viewport'：视口/悬停预取 */
function buildInitCode(config: RuntimeConfig): string {
  const onRouteRef = config.showStatus ? 'tick' : 'null'
  const statusOpen = config.showStatus ? 'showStatusUI(links,Q.length);' : ''
  const logOpen = config.debug ? 'logInjected(Q.length);' : ''

  if (config.strategy === 'viewport') {
    return `
  var idx={},seen={};
  function norm(p){return('/'+String(p).replace(/\\/+$/,'').replace(/\\/{2,}/g,'/'))}
  Q.forEach(function(r){idx[norm(r.path)]=r});
  function prefetch(pathname){
    var r=idx[norm(pathname)];
    if(!r||seen[r.chunkPath])return;
    seen[r.chunkPath]=1;
    var ls=makeRouteLinks(r,${onRouteRef});
    var frag=document.createDocumentFragment();
    ls.forEach(function(l){frag.appendChild(l)});
    document.head.appendChild(frag);
  }
  function urlOf(a){
    try{return new URL(a.getAttribute('href'),location.href)}catch(_){return null}
  }
  function init(){
    if(slow){
      if(C.debug)console.warn('[vite-plugin-preloader] 检测到省流/低速网络，跳过预取');
      return;
    }
    ${statusOpen}${logOpen}
    if('IntersectionObserver'in window){
      var io=new IntersectionObserver(function(es){
        es.forEach(function(e){
          if(!e.isIntersecting)return;
          io.unobserve(e.target);
          var u=urlOf(e.target);
          if(u&&u.origin===location.origin)prefetch(u.pathname);
        });
      },{rootMargin:'160px'});
      var as=document.querySelectorAll('a[href]');
      for(var k=0;k<as.length;k++){
        var su=urlOf(as[k]);
        if(su&&su.origin===location.origin&&idx[norm(su.pathname)])io.observe(as[k]);
      }
    }
    document.addEventListener('pointerover',function(ev){
      var t=ev.target,a=t&&t.closest?t.closest('a[href]'):null;
      if(!a)return;
      var u=urlOf(a);
      if(u&&u.origin===location.origin)prefetch(u.pathname);
    },true);
  }`
  }

  // strategy 'all'：按路由分批（每批 BATCH 个，全部落定或超时后放行下一批）
  return `
  var BATCH=4,cur=0;
  function injectBatch(){
    var b=Q.slice(cur,cur+BATCH);cur+=b.length;
    if(!b.length)return;
    var pending=b.length;
    var timer=setTimeout(function(){b.forEach(function(r){r._s&&r._s();});},8000);
    b.forEach(function(r){
      var settled=false;
      r._s=function(){
        if(settled)return;settled=true;
        if(!--pending){clearTimeout(timer);injectBatch();}
      };
      var ls=makeRouteLinks(r,r._s);
      var frag=document.createDocumentFragment();
      ls.forEach(function(l){frag.appendChild(l)});
      document.head.appendChild(frag);
    });
  }
  function init(){
    if(slow){
      if(C.debug)console.warn('[vite-plugin-preloader] 检测到省流/低速网络，跳过预取');
      return;
    }
    ${statusOpen}${logOpen}
    injectBatch();
  }`
}

/** dev：modulepreload 已静态注入，仅统计/展示 */
function devInitCode({ statusUiCode, debugCode }: { statusUiCode: string; debugCode: string }): string {
  const statusOpen = statusUiCode ? 'showStatusUI(links,0);' : ''
  const logOpen = debugCode ? 'logInjected(links.length);' : ''
  return `
  function init(){
    var els=document.querySelectorAll('link[data-preloader]');
    for(var k=0;k<els.length;k++)links.push(els[k]);
    ${logOpen}${statusOpen}
  }`
}
