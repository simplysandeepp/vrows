// Ad and tracker blocking. The browser's own blockers can't see through the proxy (every URL
// is on our domain), so requests are filtered here before they are fetched.
const AD_HOSTS = new Set([
  // Google / generic ad tech
  'doubleclick.net', 'googlesyndication.com', 'googleadservices.com', 'googletagservices.com',
  'googletagmanager.com', 'google-analytics.com', 'adservice.google.com', '2mdn.net',
  'adnxs.com', 'adsrvr.org', 'rubiconproject.com', 'pubmatic.com', 'openx.net', 'criteo.com',
  'criteo.net', 'casalemedia.com', 'amazon-adsystem.com', 'advertising.com', 'adform.net',
  'serving-sys.com', 'smartadserver.com', 'teads.tv', 'yieldmo.com', 'sharethrough.com',
  'media.net', 'bidswitch.net', 'zedo.com', 'adition.com', 'moatads.com', 'adsafeprotected.com',
  'taboola.com', 'outbrain.com', 'revcontent.com', 'mgid.com',
  // Trackers
  'scorecardresearch.com', 'quantserve.com', 'quantcount.com', 'hotjar.com', 'rlcdn.com',
  'demdex.net', 'krxd.net', 'bluekai.com', 'everesttech.net',
  // Pop-up and push ad servers
  'popads.net', 'popcash.net', 'propellerads.com', 'clickadu.com', 'hilltopads.net',
  'adsterra.com', 'a-ads.com', 'exoclick.com', 'exosrv.com', 'exdynsrv.com', 'juicyads.com',
  'trafficjunky.net', 'trafficjunky.com', 'adtng.com', 'rtbsuperhub.com', 'justservingfiles.net',
  'tsyndicate.com', 'realsrv.com', 'magsrv.com', 'ero-advertising.com', 'trafficfactory.biz',
  'adspyglass.com', 'plugrush.com', 'onclickads.net', 'onclkds.com', 'highperformanceformat.com',
  'effectivegatecpm.com', 'profitablegatecpm.com',
]);

const AD_PATHS = [
  /\/pagead\//,
  /\/ads_batch\b/,
  /\/api\/stats\/ads/,
  /\/ptracking/,
  /\/_xa\//,
  /\/youtubei\/v1\/log_event/,
];

export function isAdRequest(target) {
  const labels = target.hostname.toLowerCase().split('.');
  for (let i = 0; i < labels.length - 1; i++) {
    if (AD_HOSTS.has(labels.slice(i).join('.'))) return true;
  }
  return AD_PATHS.some((re) => re.test(target.pathname));
}

const GIF = Uint8Array.from(
  atob('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'),
  (c) => c.charCodeAt(0),
);

// An empty answer that suits what the page asked for, so it doesn't hang or error
export function blockedResponse(request) {
  const dest = request.headers.get('sec-fetch-dest') || '';
  const headers = { 'cache-control': 'public, max-age=3600', 'x-vrows': 'blocked' };
  if (dest === 'script') return new Response('', { headers: { ...headers, 'content-type': 'application/javascript' } });
  if (dest === 'style') return new Response('', { headers: { ...headers, 'content-type': 'text/css' } });
  if (dest === 'image') return new Response(GIF, { headers: { ...headers, 'content-type': 'image/gif' } });
  if (dest === 'iframe' || dest === 'document') {
    return new Response('<!doctype html><title></title>', { headers: { ...headers, 'content-type': 'text/html; charset=utf-8' } });
  }
  return new Response(null, { status: 204, headers });
}

// YouTube describes its video ads inside the player data. Renaming those keys leaves the
// player with nothing to schedule.
export const isYouTubeHost = (hostname) => /(^|\.)youtube\.com$/.test(hostname);

export function stripYouTubeAds(text) {
  return text
    .replaceAll('"adPlacements"', '"_adPlacements"')
    .replaceAll('"playerAds"', '"_playerAds"')
    .replaceAll('"adSlots"', '"_adSlots"');
}
