import { proxyUrl } from './util.js';
import { clientScript } from './client.js';

const URL_ATTRS = ['href', 'src', 'action', 'poster', 'data-src', 'data-original', 'formaction'];
const SRCSET_ATTRS = ['srcset', 'data-srcset'];
const SKIP_SCHEME = /^(javascript|mailto|tel|data|blob|about|sms):/i;

export function rewriteUrl(value, base) {
  const s = value.trim();
  if (!s || s[0] === '#' || SKIP_SCHEME.test(s)) return value;
  let u;
  try { u = new URL(s, base); } catch { return value; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return value;
  const hash = u.hash;
  u.hash = '';
  return proxyUrl(u.href) + hash;
}

function rewriteSrcset(value, base) {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [u, ...desc] = part.split(/\s+/);
      return [rewriteUrl(u, base), ...desc].join(' ');
    })
    .join(', ');
}

export function rewriteCss(css, base) {
  return css
    .replace(/url\(\s*(['"]?)([^'")]+?)\1\s*\)/gi, (m, q, u) => `url(${q}${rewriteUrl(u, base)}${q})`)
    .replace(/@import\s+(['"])([^'"]+)\1/gi, (m, q, u) => `@import ${q}${rewriteUrl(u, base)}${q}`);
}

// Sites often redirect with JS (location.href = 'https://...'), which would leave the proxy.
// Route those through the page's __vrNav helper (falls back to the real location).
const LOC_CALL = /(?<![\w$])(?:(?:window|self|top|parent|document)\.)?location\.(assign|replace)\(/g;
const LOC_SET = /(?<![\w$.])(?:(?:window|self|top|parent|document)\.)?location(?:\.href)?\s*=(?!=)/g;
export const MAX_JS_REWRITE = 300000;

export function rewriteJs(code) {
  if (code.length > MAX_JS_REWRITE || !code.includes('location')) return code;
  return code
    .replace(LOC_CALL, '(window.__vrNav||location).$1(')
    .replace(LOC_SET, '(window.__vrNav||location).href=');
}

const isJsType = (t) => !t || /javascript|ecmascript|module/i.test(t);

export function rewriteHtml(response, pageUrl) {
  const ctx = { base: pageUrl };
  const script = clientScript(pageUrl);

  return new HTMLRewriter()
    .on('base', {
      element(el) {
        const href = el.getAttribute('href');
        if (href) {
          try { ctx.base = new URL(href, pageUrl).href; } catch { /* keep pageUrl */ }
        }
        el.remove();
      },
    })
    .on('head', { element(el) { el.prepend(script, { html: true }); } })
    .on('meta', {
      element(el) {
        const equiv = (el.getAttribute('http-equiv') || '').toLowerCase();
        if (equiv === 'content-security-policy') el.remove();
        else if (equiv === 'refresh') {
          const c = el.getAttribute('content') || '';
          el.setAttribute('content', c.replace(/(url\s*=\s*)(['"]?)([^'"]+)\2/i, (m, p, q, u) => p + q + rewriteUrl(u, ctx.base) + q));
        }
      },
    })
    .on('style', {
      text(chunk) {
        this.buf = (this.buf || '') + chunk.text;
        chunk.remove();
        if (chunk.lastInTextNode) {
          chunk.after(rewriteCss(this.buf, ctx.base), { html: true });
          this.buf = '';
        }
      },
    })
    .on('script', {
      element(el) {
        this.js = !el.getAttribute('src') && isJsType(el.getAttribute('type'));
        this.buf = '';
      },
      text(chunk) {
        if (!this.js) return;
        this.buf += chunk.text;
        chunk.remove();
        if (chunk.lastInTextNode) {
          chunk.after(rewriteJs(this.buf), { html: true });
          this.buf = '';
        }
      },
    })
    .on('*', {
      element(el) {
        if (el.tagName === 'base') return;
        for (const a of URL_ATTRS) {
          const v = el.getAttribute(a);
          if (v != null) el.setAttribute(a, rewriteUrl(v, ctx.base));
        }
        if (el.tagName === 'object') {
          const v = el.getAttribute('data');
          if (v != null) el.setAttribute('data', rewriteUrl(v, ctx.base));
        }
        for (const a of SRCSET_ATTRS) {
          const v = el.getAttribute(a);
          if (v != null) el.setAttribute(a, rewriteSrcset(v, ctx.base));
        }
        const style = el.getAttribute('style');
        if (style && style.includes('url(')) el.setAttribute('style', rewriteCss(style, ctx.base));
        el.removeAttribute('integrity');
        el.removeAttribute('nonce');
        if (['_blank', '_top', '_parent'].includes(el.getAttribute('target'))) el.setAttribute('target', '_self');
      },
    })
    .transform(response);
}
