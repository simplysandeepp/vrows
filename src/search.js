import { text, proxyUrl } from './util.js';

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const decodeEntities = (s) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
const stripTags = (s) => s.replace(/<[^>]+>/g, '');
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const jsString = (s) => JSON.stringify(s).replace(/</g, '\\u003c');

// Bing sometimes wraps result links as bing.com/ck/a?...&u=a1<base64url of the real url>
function unwrapBing(href) {
  try {
    const u = new URL(href);
    if (/(^|\.)bing\.com$/.test(u.hostname) && u.pathname.startsWith('/ck/')) {
      const v = u.searchParams.get('u') || '';
      if (v.startsWith('a1')) {
        const b64 = v.slice(2).replace(/-/g, '+').replace(/_/g, '/');
        const bytes = Uint8Array.from(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)), (c) => c.charCodeAt(0));
        return new TextDecoder().decode(bytes);
      }
    }
  } catch { /* fall through */ }
  return href;
}

function parseBing(html) {
  const results = [];
  for (const raw of html.match(/<li class="b_algo"[\s\S]*?<\/li>/g) || []) {
    const item = raw.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/g, '');
    const m = item.match(/<a\b[^>]*href="([^"]+)"[^>]*>\s*<h2[^>]*>([\s\S]*?)<\/h2>/);
    if (!m) continue;
    const href = unwrapBing(decodeEntities(m[1]));
    if (!/^https?:\/\//.test(href)) continue;
    const p = item.match(/<p\b[^>]*>([\s\S]*?)<\/p>/);
    results.push({
      href,
      title: decodeEntities(stripTags(m[2])).trim(),
      snippet: p ? decodeEntities(stripTags(p[1])).trim() : '',
    });
  }
  return results;
}

export async function search(url) {
  const q = (url.searchParams.get('q') || '').trim();
  const first = Math.max(1, parseInt(url.searchParams.get('first') || '1', 10) || 1);
  if (!q) return text('Missing query', 400);

  let results = [];
  let failed = '';
  try {
    const res = await fetch(
      `https://www.bing.com/search?q=${encodeURIComponent(q)}&first=${first}&setlang=en&cc=us`,
      { headers: { 'user-agent': MOBILE_UA, 'accept-language': 'en-US,en;q=0.9' } },
    );
    results = parseBing(await res.text());
  } catch (err) {
    failed = err.message;
  }

  const items = results.map((r) => {
    let host = r.href;
    try {
      const u = new URL(r.href);
      host = u.hostname.replace(/^www\./, '') + u.pathname.replace(/\/$/, '');
    } catch { /* keep href */ }
    return `<li><a class="t" href="${esc(proxyUrl(r.href))}">${esc(r.title)}</a><div class="u">${esc(host.slice(0, 70))}</div>${r.snippet ? `<p>${esc(r.snippet)}</p>` : ''}</li>`;
  }).join('');

  const next = `/api/search?q=${encodeURIComponent(q)}&first=${first + 10}`;
  const body = results.length
    ? `<ol>${items}</ol><a class="more" href="${esc(next)}">More results</a>`
    : `<p class="none">${failed ? `Search failed: ${esc(failed)}` : 'No results found.'}</p>`;

  const page = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(q)} - Search</title>
<style>
:root{--bg:#f5f6f8;--s:#fff;--t:#151a24;--m:#6a7384;--l:#dde1e8;--a:#3b6cf6}
@media(prefers-color-scheme:dark){:root{--bg:#0b0f18;--s:#141a27;--t:#e8ecf4;--m:#8b95a8;--l:#263045;--a:#7c9dff}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--t);font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
main{max-width:720px;margin:0 auto;padding:12px 14px 40px}
ol{list-style:none;margin:0;padding:0;display:grid;gap:10px}
li{background:var(--s);border:1px solid var(--l);border-radius:12px;padding:12px 14px}
.t{color:var(--a);font-size:17px;font-weight:600;text-decoration:none;word-break:break-word}
.u{color:var(--m);font-size:13px;margin:2px 0 4px;word-break:break-all}
li p{margin:0;font-size:15px}
.more{display:block;text-align:center;margin-top:14px;padding:12px;border:1px solid var(--l);border-radius:12px;background:var(--s);color:var(--a);text-decoration:none;font-weight:600}
.none{color:var(--m);text-align:center;margin-top:40px}
</style></head><body><main>${body}</main>
<script>try{parent.postMessage({vp:1,url:${jsString(q)},title:${jsString(q + ' - Search')}},'*')}catch(e){}</script>
</body></html>`;

  return new Response(page, {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}
