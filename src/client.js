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
  return of.call(this,i,o);
};}
var xo=XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open=function(m,u){arguments[1]=px(u);return xo.apply(this,arguments)};
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
    if(t.pathname===new URL(B).pathname) return false;
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

// Direct media files (not streams assembled in the page) that the shell can offer for download
var MEDIA=/\.(mp4|m4v|webm|mov|mkv|ogv|mp3|m4a|aac|ogg|oga|wav|flac|m3u8|mpd)$/i,IMG=/\.(jpe?g|png|gif|webp|avif|svg|ico|bmp)$/i,seen={},found=[];
function addMedia(u,hint){
  if(!u||/^(blob|data):/i.test(u)) return;
  var real;
  try{
    var a=new URL(u,location.href);
    real=a.origin===location.origin?realOf(a.pathname+a.search):a.href;
    var path=new URL(real).pathname;
    if(IMG.test(path)||(!hint&&!MEDIA.test(path))) return;
    if(seen[real]) return;
    seen[real]=1;
    var ext=(path.match(MEDIA)||[])[1];
    found.push({url:real,kind:/^(m3u8|mpd)$/i.test(ext||'')?'stream':(hint||(/^(mp3|m4a|aac|ogg|oga|wav|flac)$/i.test(ext||'')?'audio':'video'))});
    try{parent.postMessage({vp:3,media:found},'*')}catch(e){}
  }catch(e){}
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

document.addEventListener('DOMContentLoaded',notify);
window.addEventListener('load',notify);
notify();
})();</script>`;
}
