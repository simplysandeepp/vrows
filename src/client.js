// Script injected at the top of every proxied page. It routes JS-initiated requests and
// navigation back through the proxy, keeps scripts from hijacking the frame, isolates
// cookies/storage per site, and reports the current real URL to the app shell.
export function clientScript(base) {
  const cfg = (v) => JSON.stringify(v).replace(/</g, '\\u003c');
  return `<script>(function(){
var B=${cfg(base)};
function hostOf(u){try{return new URL(u).hostname}catch(e){return ''}}
// "example" for www.example.com / example.co.uk, so example.com and example.org count as one site
function site(h){var p=String(h).split('.'),n=p.length;if(n>2&&p[n-1].length===2&&p[n-2].length<=3)return p[n-3];return n>1?p[n-2]:h}
function inDomain(h,d){return h===d||h.slice(-d.length-1)==='.'+d}
function isProxied(u){return u.indexOf('/p/')===0||u.indexOf('/api/')===0}
function px(u){
  try{
    u=String(u);
    if(isProxied(u)) return u;
    var a=new URL(u,B);
    if(a.protocol!=='http:'&&a.protocol!=='https:') return u;
    if(a.origin===location.origin){
      if(isProxied(a.pathname)) return a.pathname+a.search+a.hash;
      a=new URL(a.pathname+a.search+a.hash,B);
    }
    return '/p/'+a.protocol.slice(0,-1)+'/'+a.host+a.pathname+a.search+a.hash;
  }catch(e){return u}
}
// the real address behind a proxied path
function realOf(h){
  try{
    var m=String(h).match(/^\\/p\\/(https?)\\/([^\\/?#]+)(.*)$/);
    if(m) return m[1]+'://'+m[2]+(m[3]||'/');
    return new URL(h,B).href;
  }catch(e){return h}
}
function notify(){try{parent.postMessage({vp:1,url:B,title:document.title},'*')}catch(e){}}

var of=window.fetch;
if(of){window.fetch=function(i,o){
  try{
    if(typeof i==='string'||i instanceof URL) i=px(i);
    else if(i&&i.url) i=new Request(px(i.url),i);
  }catch(e){}
  var pr=of.call(this,i,o);
  pr.then(function(res){
    try{
      if(/json/i.test(res.headers.get('content-type')||'')&&!(+res.headers.get('content-length')>300000)) res.clone().text().then(scanText);
    }catch(e){}
  }).catch(function(){});
  return pr;
};}
var xo=XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open=function(m,u){arguments[1]=px(u);return xo.apply(this,arguments)};
var xs=XMLHttpRequest.prototype.send;
XMLHttpRequest.prototype.send=function(){
  var x=this;
  this.addEventListener('load',function(){
    try{
      if(/json/i.test(x.getResponseHeader('content-type')||'')&&(x.responseType===''||x.responseType==='text')&&x.responseText.length<400000) scanText(x.responseText);
    }catch(e){}
  });
  return xs.apply(this,arguments);
};
if(navigator.sendBeacon){var sb=navigator.sendBeacon;navigator.sendBeacon=function(u,d){return sb.call(navigator,px(u),d)}}
if(window.EventSource){var ES=window.EventSource;window.EventSource=function(u,o){return new ES(px(u),o)};window.EventSource.prototype=ES.prototype}
if(window.Worker){var WK=window.Worker;window.Worker=function(u,o){return new WK(px(u),o)};window.Worker.prototype=WK.prototype}
try{if(navigator.serviceWorker)navigator.serviceWorker.register=function(){return Promise.reject(new Error('Service workers are disabled'))}}catch(e){}

// Scripts may not move the page on their own (domain guards, geo redirects and ad
// popunders do that, and loop forever inside a proxy). Anything right after a tap/click/key
// press to a page of the same site is fine, as is a limited number of same-site path changes.
var lastInput=0;
['click','keydown','touchend','pointerup','mouseup','submit'].forEach(function(n){
  document.addEventListener(n,function(){lastInput=Date.now()},true);
});
function autoMoves(){
  try{
    var r=JSON.parse(sg.call(sessionStorage,'vr~autonav')||'{}'),now=Date.now();
    if(!r.t||now-r.t>10000) r={n:0,t:now};
    r.n++; ss.call(sessionStorage,'vr~autonav',JSON.stringify(r));
    return r.n;
  }catch(e){return 1}
}
function navOk(u){
  try{
    // a target that embeds our own address is a guard script echoing location.href back at us
    if(String(u).indexOf(location.host)>=0||isProxied(String(u))) return false;
    var t=new URL(String(u),B);
    // ad hijacks and tab-unders send the page to another site, even right after a click
    if(site(t.hostname)!==site(hostOf(B))) return false;
    if(Date.now()-lastInput<5000) return true;
    if(navigator.userActivation&&navigator.userActivation.isActive) return true;
    // some sites bounce once to the same page with a token (a "checking your browser" step);
    // a couple of such moves are fine, endless ones are not
    return autoMoves()<=2;
  }catch(e){return true}
}
window.__vrNav={
  assign:function(u){if(navOk(u))location.assign(px(u))},
  replace:function(u){if(navOk(u))location.replace(px(u))},
  set href(v){if(navOk(v))location.href=px(v)},
  get href(){return location.href}
};
var wo=window.open;
// There are no tabs here: same-site popups load in this frame, cross-site ones are dropped
window.open=function(u){
  if(!u) return wo.apply(this,arguments);
  try{
    var t=new URL(String(u),B);
    if(site(t.hostname)===site(hostOf(B))&&!isProxied(String(u))) location.href=px(u);
  }catch(e){}
  return null;
};

[[HTMLScriptElement,'src'],[HTMLImageElement,'src'],[HTMLIFrameElement,'src'],[HTMLSourceElement,'src'],[HTMLMediaElement,'src'],[HTMLLinkElement,'href']].forEach(function(p){
  var d=Object.getOwnPropertyDescriptor(p[0].prototype,p[1]);
  if(d&&d.set) Object.defineProperty(p[0].prototype,p[1],{get:d.get,set:function(v){d.set.call(this,px(v))},configurable:true,enumerable:d.enumerable});
});
var sa=Element.prototype.setAttribute;
Element.prototype.setAttribute=function(n,v){
  var t=this.tagName;
  if((n==='src'&&t!=='A')||(n==='href'&&t==='LINK')) v=px(v);
  return sa.call(this,n,v);
};

['pushState','replaceState'].forEach(function(n){
  var o=history[n];
  history[n]=function(s,t,u){
    try{if(u)B=new URL(u,B).href}catch(e){}
    notify();
    return o.call(history,s,t);
  };
});

var SKIPHREF=/^(#|javascript:|mailto:|tel:)/i;
// What the user just tapped, so the shell can recover if a script then throws the frame elsewhere
document.addEventListener('click',function(e){
  if(!e.isTrusted) return;
  var a=e.target&&e.target.closest&&e.target.closest('a[href]');
  var h=a&&a.getAttribute('href');
  if(!h||SKIPHREF.test(h)) return;
  try{parent.postMessage({vp:2,intent:realOf(h)},'*')}catch(x){}
},true);
document.addEventListener('click',function(e){
  if(e.defaultPrevented) return;
  var a=e.target&&e.target.closest&&e.target.closest('a[href]');
  if(!a) return;
  var h=a.getAttribute('href');
  if(!h||SKIPHREF.test(h)||isProxied(h)) return;
  e.preventDefault();
  if(!e.isTrusted&&site(new URL(h,B).hostname)!==site(hostOf(B))) return; // script-made cross-site click
  location.href=px(h);
},false);
// a.click() on an anchor that is not in the page never reaches the listener above
var ac=HTMLAnchorElement.prototype.click;
HTMLAnchorElement.prototype.click=function(){
  var h=this.getAttribute('href');
  if(!h||this.isConnected||SKIPHREF.test(h)||isProxied(h)) return ac.call(this);
  try{if(site(new URL(h,B).hostname)===site(hostOf(B))) location.href=px(h)}catch(e){}
};

function formGo(f){
  var act=f.getAttribute('action')||'',real=act?realOf(act):B;
  if((f.getAttribute('method')||'get').toLowerCase()!=='get'){
    if(!isProxied(act)) f.setAttribute('action',px(real));
    return false;
  }
  var t=new URL(real),p=new URLSearchParams(new FormData(f));
  t.search=p.toString(); t.hash='';
  location.href=px(t.href);
  return true;
}
document.addEventListener('submit',function(e){
  var f=e.target;
  if(e.defaultPrevented||!f||f.tagName!=='FORM') return;
  var s=e.submitter;
  if(s&&s.name&&(f.getAttribute('method')||'get').toLowerCase()==='get'){
    e.preventDefault();
    var t=new URL(realOf(f.getAttribute('action')||B)),p=new URLSearchParams(new FormData(f));
    p.append(s.name,s.value); t.search=p.toString(); t.hash='';
    location.href=px(t.href);
    return;
  }
  if(formGo(f)) e.preventDefault();
},false);
var fsub=HTMLFormElement.prototype.submit;
HTMLFormElement.prototype.submit=function(){ if(!formGo(this)) fsub.call(this) };

// document.cookie: stored as vr~<domain>~<name> so each site only sees its own cookies
try{
  var cd=Object.getOwnPropertyDescriptor(Document.prototype,'cookie');
  if(cd&&cd.get&&cd.set) Object.defineProperty(document,'cookie',{configurable:true,
    get:function(){
      var h=hostOf(B),out=[];
      cd.get.call(document).split(/;\\s*/).forEach(function(p){
        if(p.indexOf('vr~')!==0) return;
        var eq=p.indexOf('='); if(eq<0) return;
        var full=p.slice(3,eq),i=full.indexOf('~'); if(i<1) return;
        if(inDomain(h,full.slice(0,i))) out.push(full.slice(i+1)+'='+p.slice(eq+1));
      });
      return out.join('; ');
    },
    set:function(v){
      var a=String(v).split(';'),nv=a[0],eq=nv.indexOf('=');
      var name=eq<0?'':nv.slice(0,eq).trim(),val=eq<0?nv.trim():nv.slice(eq+1).trim();
      if(!name&&!val) return;
      var h=hostOf(B),dom=h,age=null;
      for(var j=1;j<a.length;j++){
        var kv=a[j].split('='),k=kv[0].trim().toLowerCase(),x=kv.slice(1).join('=').trim();
        if(k==='domain'&&x){x=x.replace(/^\\./,'').toLowerCase();if(inDomain(h,x))dom=x}
        else if(k==='max-age') age=parseInt(x,10);
        else if(k==='expires'){var t=Date.parse(x);if(!isNaN(t)&&age===null)age=Math.round((t-Date.now())/1000)}
      }
      var s='vr~'+dom+'~'+name+'='+val+'; Path=/; SameSite=Lax; Secure';
      if(age!==null&&!isNaN(age)) s+='; Max-Age='+Math.min(age,34560000);
      cd.set.call(document,s);
    }});
}catch(e){}

// localStorage/sessionStorage: namespaced per site
try{
  var SP=Storage.prototype,sg=SP.getItem,ss=SP.setItem,sr=SP.removeItem,sk=SP.key,sl=Object.getOwnPropertyDescriptor(SP,'length');
  var pre=function(){return 'vr~'+hostOf(B)+'~'};
  var names=function(st){var p=pre(),o=[],n=sl.get.call(st);for(var i=0;i<n;i++){var k=sk.call(st,i);if(k&&k.indexOf(p)===0)o.push(k.slice(p.length))}return o};
  SP.getItem=function(k){return sg.call(this,pre()+k)};
  SP.setItem=function(k,v){return ss.call(this,pre()+k,v)};
  SP.removeItem=function(k){return sr.call(this,pre()+k)};
  SP.key=function(i){var n=names(this);return i<n.length?n[i]:null};
  SP.clear=function(){var self=this;names(this).forEach(function(k){sr.call(self,pre()+k)})};
  Object.defineProperty(SP,'length',{configurable:true,get:function(){return names(this).length}});
}catch(e){}

// Media the page is playing, so the shell can offer to save it. Candidates come from the page's
// media elements, its network requests and URLs inside JSON answers (players usually fetch their
// file list from an API). Each one is checked through the proxy before it is offered, so only
// real video/audio files and HLS playlists are listed.
var MEDIA=/\\.(mp4|m4v|webm|mov|mkv|ogv|mp3|m4a|aac|ogg|oga|wav|flac|m3u8)$/i,IMG=/\\.(jpe?g|png|gif|webp|avif|svg|ico|bmp)$/i,seen={},found=[],queue=[],active=0;
function postMedia(){try{parent.postMessage({vp:3,media:found},'*')}catch(e){}}
function mediaKind(ct,ext){
  ct=(ct||'').toLowerCase();
  if(ct.indexOf('mpegurl')>=0) return 'hls';
  if(ext==='m3u8'&&(ct.indexOf('text/')===0||ct.indexOf('application/octet')===0)) return 'hls';
  if(ct.indexOf('video/')===0) return 'video';
  if(ct.indexOf('audio/')===0) return 'audio';
  if(ct.indexOf('octet-stream')>=0||ct.indexOf('binary')>=0){
    if(/^(mp4|m4v|webm|mov|mkv|ogv)$/.test(ext)) return 'video';
    if(/^(mp3|m4a|aac|ogg|oga|wav|flac)$/.test(ext)) return 'audio';
  }
  return null;
}
function addMedia(u,hint,label){
  if(!u||/^(blob|data):/i.test(u)) return;
  try{
    var a=new URL(u,location.href);
    a.hash='';
    var real=a.origin===location.origin?realOf(a.pathname+a.search):a.href;
    // our own checks and the app's downloads carry a helper parameter; it is not part of the file's address
    real=real.replace(/([?&])__vrp=[^&]*(&?)/,function(all,lead,trail){return trail?lead:''});
    if(real.slice(-1)==='?') real=real.slice(0,-1);
    var path=new URL(real).pathname,m=path.match(MEDIA);
    if(IMG.test(path)||(!hint&&!m)||seen[real]) return;
    seen[real]=1;
    queue.push({url:real,ext:m?m[1].toLowerCase():'',label:label||''});
    pump();
  }catch(e){}
}
function pump(){while(active<3&&queue.length){active++;check(queue.shift())}}
function peek(res){
  if(!res.body||!res.body.getReader) return res.text().then(function(t){return t.slice(0,2048)});
  var r=res.body.getReader();
  return r.read().then(function(x){
    try{r.cancel()}catch(e){}
    return x.value?new TextDecoder().decode(x.value.slice(0,2048)):'';
  });
}
function check(c){
  var u=px(c.url);
  u+=(u.indexOf('?')<0?'?':'&')+'__vrp='+encodeURIComponent(B);
  of.call(window,u,{headers:{Range:'bytes=0-2047'}}).then(function(res){
    if(!res.ok&&res.status!==206) return;
    var ct=res.headers.get('content-type')||'';
    if(/json/i.test(ct)) return res.text().then(scanText);
    var cr=res.headers.get('content-range'),total=cr&&/\\/(\\d+)$/.test(cr)?+RegExp.$1:(+res.headers.get('content-length')||0);
    var kind=mediaKind(ct,c.ext);
    return peek(res).then(function(txt){
      if(!kind&&/^\\s*#EXTM3U/.test(txt)) kind='hls';
      if(!kind) return;
      found.push({url:c.url,kind:kind,label:c.label,size:kind==='hls'?0:total,master:kind==='hls'&&txt.indexOf('#EXT-X-STREAM-INF')>=0});
      postMedia();
    });
  }).catch(function(){}).then(function(){active--;pump()});
}
function walk(o,hits,depth){
  if(!o||typeof o!=='object'||depth>8) return;
  for(var k in o){
    var v=o[k];
    if(typeof v==='string'){
      if(v.indexOf('http')===0){
        try{var p=new URL(v).pathname;if(MEDIA.test(p)&&!IMG.test(p)) hits.push({url:v,label:String(o.quality||o.label||o.height||o.resolution||o.format||'')})}catch(e){}
      }
    }else walk(v,hits,depth+1);
  }
}
var BS=String.fromCharCode(92);
function scanText(t){
  if(!t||t.length>400000||!/(mp4|m4v|webm|mov|m3u8)/i.test(t)) return;
  var hits=[];
  try{walk(JSON.parse(t),hits,0)}catch(e){
    var tt=t.split(BS+'/').join('/').split(BS+'u0026').join('&');
    (tt.match(/https?:\\/\\/[^\\s"'<>]+?\\.(?:mp4|m4v|webm|mov|m3u8)(?:\\?[^\\s"'<>]*)?/gi)||[]).forEach(function(x){hits.push({url:x,label:''})});
  }
  hits.slice(0,16).forEach(function(h){addMedia(h.url,null,h.label)});
}
function scanMedia(){
  try{
    document.querySelectorAll('video,audio').forEach(function(m){
      var h=m.tagName==='AUDIO'?'audio':'video';
      addMedia(m.currentSrc,h); addMedia(m.getAttribute('src'),h);
      m.querySelectorAll('source').forEach(function(x){addMedia(x.getAttribute('src'),h)});
    });
    performance.getEntriesByType('resource').forEach(function(e){
      addMedia(e.name,e.initiatorType==='video'||e.initiatorType==='audio'?e.initiatorType:null);
    });
  }catch(e){}
}
setInterval(scanMedia,2000);
// media found in nested frames (embedded players) is passed up to the shell
window.addEventListener('message',function(e){
  if(e.data&&e.data.vp===3&&e.source!==parent&&window.top!==window){
    try{parent.postMessage(e.data,'*')}catch(x){}
  }
});

// lets the shell show its loading indicator when a link inside the page is followed
window.addEventListener('beforeunload',function(){try{parent.postMessage({vp:4},'*')}catch(e){}});

document.addEventListener('DOMContentLoaded',notify);
window.addEventListener('load',notify);
notify();
})();</script>`;
}
