import { text, proxyUrl, realFromProxyPath, isBlockedHost } from './util.js';
import { jarFromRequest, cookieHeader, absorbSetCookies } from './cookies.js';
import { rewriteHtml, rewriteCss, rewriteJs, MAX_JS_REWRITE } from './rewrite.js';
import { search } from './search.js';
import { isAdRequest, blockedResponse, isYouTubeHost, stripYouTubeAds } from './adblock.js';

const SHELL = new Set([
  '/', '/index.html', '/manifest.webmanifest', '/sw.js',
  '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png',
]);
const PASS_HEADERS = [
  'content-type', 'cache-control', 'content-disposition', 'accept-ranges',
  'content-range', 'etag', 'last-modified', 'expires',
];
// Browser headers that must not reach the target site
const DROP_REQUEST_HEADERS =
  /^(host|cookie|origin|referer|content-length|connection|keep-alive|transfer-encoding|te|upgrade|upgrade-insecure-requests|accept-encoding|priority|dnt|sec-.+|cf-.+|x-forwarded-.+|x-real-ip|true-client-ip|forwarded|via)$/i;
const STATIC_FILE = /\.(js|mjs|css|png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf)$/i;
const MAX_REDIRECTS = 12;
// YouTube's mobile site depends on the real location.pathname, which a path-based proxy can't
// provide. The desktop site works, so always ask for that one.
const DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';

function adjustForSite(target, headers) {
  if (/(^|\.)youtube\.com$/.test(target.hostname)) {
    if (target.hostname === 'm.youtube.com') target.hostname = 'www.youtube.com';
    headers.set('user-agent', DESKTOP_UA);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/api/login') return login(request, env, url);
    if (path === '/api/check' || path === '/api/search' || path.startsWith('/p/')) {
      const deny = denied(request, env);
      if (deny) return deny;
      if (path === '/api/check') return text('ok', 200);
      return path === '/api/search' ? search(url) : proxy(request, url, env);
    }

    if (!SHELL.has(path)) {
      const redirect = fromReferer(request, url);
      if (redirect) return redirect;
    }
    return env.ASSETS.fetch(request);
  },
};

// The access key lives in an HttpOnly cookie, so it never shows up in URLs or page scripts.
function readKeyCookie(request) {
  const m = (request.headers.get('cookie') || '').match(/(?:^|;\s*)vrk=([^;]*)/);
  return m ? decodeURIComponent(m[1]) : '';
}

// Access is open unless a PROXY_KEY secret is set
function denied(request, env) {
  if (env.PROXY_KEY && readKeyCookie(request) !== env.PROXY_KEY) return text('Unauthorized', 401);
  return null;
}

async function login(request, env, url) {
  if (!env.PROXY_KEY) return text('ok', 200);
  const given = request.method === 'POST' ? (await request.text()).trim() : url.searchParams.get('k') || '';
  if (given !== env.PROXY_KEY) return text('Wrong key', 401);
  return new Response('ok', {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'set-cookie': `vrk=${encodeURIComponent(given)}; Path=/; Max-Age=31536000; Secure; HttpOnly; SameSite=Lax`,
    },
  });
}

// The real URL of the proxied page that made this request, taken from the Referer
function pageFromReferer(request, url) {
  try {
    const r = new URL(request.headers.get('referer') || '');
    if (r.origin !== url.origin) return null;
    const page = realFromProxyPath(r.pathname + r.search);
    if (page) page.hash = '';
    return page;
  } catch {
    return null;
  }
}

// Catch requests a page made straight to our own origin (e.g. JS doing location.href = '/login')
// and send them to the site that page was proxying.
function fromReferer(request, url) {
  const page = pageFromReferer(request, url);
  if (!page) return null;
  const real = new URL(url.pathname + url.search, page);
  return new Response(null, { status: 307, headers: { location: proxyUrl(real.href) } });
}

// Pulls a helper parameter out of a raw query string without re-encoding the rest
// (signed URLs break if their query is re-serialised)
function takeParam(search, name) {
  const re = new RegExp('([?&])' + name + '=([^&]*)(&?)');
  const m = search.match(re);
  if (!m) return { search, value: null };
  const rest = search.replace(re, (all, lead, v, trail) => (trail ? lead : ''));
  let value = null;
  try { value = decodeURIComponent(m[2]); } catch { /* ignore */ }
  return { search: rest === '?' ? '' : rest, value };
}

async function proxy(request, url, env) {
  let target = realFromProxyPath(url.pathname + url.search);
  if (!target) return text('Bad address', 400);
  // downloads started from the app carry the page they came from (many CDNs check the referer)
  const taken = takeParam(target.search, '__vrp');
  let hintedPage = null;
  if (taken.value !== null) {
    target.search = taken.search;
    try { hintedPage = new URL(taken.value); hintedPage.hash = ''; } catch { hintedPage = null; }
    if (hintedPage && hintedPage.protocol !== 'http:' && hintedPage.protocol !== 'https:') hintedPage = null;
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') return text('Only http/https', 400);

  // A page built a URL on our own origin: it means "this path on the site I'm proxying"
  const page = hintedPage || pageFromReferer(request, url);
  if (target.host === url.host && page) target = new URL(target.pathname + target.search, page);
  if (target.host === url.host || isBlockedHost(target.hostname)) return text('Blocked target', 403);
  if (env.ADBLOCK !== 'off' && isAdRequest(target)) return blockedResponse(request);

  const headers = new Headers();
  for (const [name, value] of request.headers) {
    if (!DROP_REQUEST_HEADERS.test(name)) headers.set(name, value);
  }
  if (!headers.has('user-agent')) headers.set('user-agent', 'Mozilla/5.0');

  // Referer/Origin should describe the proxied page, not our own origin
  const referer = page ? page.href : target.origin + '/';
  const origin = page ? page.origin : target.origin;

  let method = request.method;
  let body = method !== 'GET' && method !== 'HEAD' ? await request.arrayBuffer() : undefined;
  const jar = jarFromRequest(request);
  const setCookies = [];
  let res;

  // Follow redirects here, with cookies, instead of handing them to the browser.
  // Sites that bounce between domains based on cookies/region would otherwise loop forever.
  for (let hop = 0; ; hop++) {
    const h = new Headers(headers);
    h.set('referer', referer);
    if (method !== 'GET' && method !== 'HEAD') h.set('origin', origin);
    const cookie = cookieHeader(jar, target.hostname);
    if (cookie) h.set('cookie', cookie);
    adjustForSite(target, h);

    const cacheable = method === 'GET' && !h.has('range') && STATIC_FILE.test(target.pathname);
    try {
      // Sites fronted by Cloudflare sometimes answer 525/526 to Worker subrequests; a retry usually works
      for (let attempt = 0; ; attempt++) {
        res = await fetch(target.href, {
          method,
          headers: h,
          body,
          redirect: 'manual',
          cf: cacheable ? { cacheEverything: true, cacheTtl: 86400 } : undefined,
        });
        if ((res.status !== 525 && res.status !== 526) || attempt >= 2 || body) break;
      }
    } catch (err) {
      return text(`Could not reach ${target.host}: ${err.message}`, 502);
    }
    setCookies.push(...absorbSetCookies(jar, res, target.hostname));

    const loc = res.headers.get('location');
    if (!(res.status >= 300 && res.status < 400 && loc)) break;
    if (hop >= MAX_REDIRECTS) return text(`${target.host} keeps redirecting (it may be blocking this proxy).`, 508);

    let next;
    try { next = new URL(loc, target); } catch { return text('Bad redirect', 502); }
    if (next.protocol !== 'http:' && next.protocol !== 'https:') return text('Bad redirect', 502);
    if (next.host === url.host || isBlockedHost(next.hostname)) return text('Blocked target', 403);
    if (res.status === 303 || ((res.status === 301 || res.status === 302) && method === 'POST')) {
      method = 'GET';
      body = undefined;
      headers.delete('content-type');
    }
    target = next;
  }

  const out = new Headers();
  for (const name of PASS_HEADERS) {
    const v = res.headers.get(name);
    if (v) out.set(name, v);
  }
  for (const c of setCookies) out.append('set-cookie', c);
  out.set('x-vrows-final', target.href); // where redirects ended up (helps explain odd results)
  const type = (res.headers.get('content-type') || '').toLowerCase();

  if (type.includes('text/html')) {
    out.set('cache-control', 'no-store');
    return rewriteHtml(new Response(res.body, { status: res.status, headers: out }), target.href, env.ADBLOCK !== 'off');
  }
  if (type.includes('json') && env.ADBLOCK !== 'off' && isYouTubeHost(target.hostname) && target.pathname.startsWith('/youtubei/')) {
    return new Response(stripYouTubeAds(await res.text()), { status: res.status, headers: out });
  }
  if (type.includes('text/css')) {
    return new Response(rewriteCss(await res.text(), target.href), { status: res.status, headers: out });
  }

  const length = res.headers.get('content-length');
  if (/javascript|ecmascript/.test(type) && length && Number(length) <= MAX_JS_REWRITE) {
    return new Response(rewriteJs(await res.text()), { status: res.status, headers: out });
  }

  // Everything else streams through untouched. Keep the length so media can seek.
  if (length && !res.headers.get('content-encoding')) out.set('content-length', length);
  return new Response(res.body, { status: res.status, headers: out });
}
