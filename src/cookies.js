// Cookies of proxied sites are stored in the browser under our own origin, renamed to
// "vr~<domain>~<name>" so sites cannot see or overwrite each other's cookies.
const PREFIX = 'vr~';
const MAX_AGE = 34560000; // 400 days

const domainMatches = (host, domain) => host === domain || host.endsWith('.' + domain);

// Cookies the browser sent us, as [{domain, name, value}]
export function jarFromRequest(request) {
  const jar = [];
  for (const part of (request.headers.get('cookie') || '').split(/;\s*/)) {
    if (!part.startsWith(PREFIX)) continue;
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const full = part.slice(PREFIX.length, eq);
    const i = full.indexOf('~');
    if (i < 1) continue;
    jar.push({ domain: full.slice(0, i), name: full.slice(i + 1), value: part.slice(eq + 1) });
  }
  return jar;
}

// Cookie header to send upstream for a host
export function cookieHeader(jar, host) {
  return jar
    .filter((c) => domainMatches(host, c.domain))
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');
}

// Applies upstream Set-Cookie headers to the jar and returns the equivalent
// Set-Cookie headers to hand to the browser.
export function absorbSetCookies(jar, res, host) {
  const out = [];
  for (const line of res.headers.getSetCookie?.() || []) {
    const parts = line.split(';').map((p) => p.trim());
    const eq = parts[0].indexOf('=');
    if (eq < 1) continue;
    const name = parts[0].slice(0, eq);
    const value = parts[0].slice(eq + 1);

    let domain = host;
    let maxAge = null;
    let httpOnly = false;
    for (const attr of parts.slice(1)) {
      const [k, ...rest] = attr.split('=');
      const v = rest.join('=').trim();
      switch (k.toLowerCase()) {
        case 'domain': {
          const d = v.replace(/^\./, '').toLowerCase();
          if (d && domainMatches(host, d)) domain = d;
          break;
        }
        case 'max-age':
          maxAge = parseInt(v, 10);
          break;
        case 'expires': {
          const t = Date.parse(v);
          if (!Number.isNaN(t) && maxAge === null) maxAge = Math.round((t - Date.now()) / 1000);
          break;
        }
        case 'httponly':
          httpOnly = true;
          break;
      }
    }

    const expired = maxAge !== null && maxAge <= 0;
    const i = jar.findIndex((c) => c.name === name && c.domain === domain);
    if (i >= 0) jar.splice(i, 1);
    if (!expired) jar.push({ name, value, domain });

    let header = `${PREFIX}${domain}~${name}=${expired ? '' : value}; Path=/; Secure; SameSite=Lax`;
    if (httpOnly) header += '; HttpOnly';
    if (maxAge !== null) header += `; Max-Age=${expired ? 0 : Math.min(maxAge, MAX_AGE)}`;
    out.push(header);
  }
  return out;
}
