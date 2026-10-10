// Proxied pages live under /p/<scheme>/<host>/<path>?<query>, mirroring the real site's layout so
// relative URLs (script chunks, imports, CSS) resolve naturally.
export function text(body, status) {
  return new Response(body, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } });
}

export function proxyUrl(target) {
  const u = new URL(target);
  return `/p/${u.protocol.slice(0, -1)}/${u.host}${u.pathname}${u.search}${u.hash}`;
}

// Inverse of proxyUrl for a path (+ search) on our origin. Returns a URL or null.
export function realFromProxyPath(pathAndSearch) {
  const m = pathAndSearch.match(/^\/p\/(https?)\/([^/?#]+)(.*)$/);
  if (!m) return null;
  try {
    return new URL(`${m[1]}://${m[2]}${m[3] || '/'}`);
  } catch {
    return null;
  }
}

export function isBlockedHost(hostname) {
  const h = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (h.includes(':')) {
    return h === '::1' || h === '::' || /^f[cd]/.test(h) || /^fe[89ab]/.test(h) || h.startsWith('::ffff:');
  }
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return (
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}
