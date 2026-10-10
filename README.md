# Vrows

A small installable web app (PWA) for simple browsing through your own free Cloudflare Worker. Type an address or a search, and pages are fetched by the Worker and shown in the app.

## How it works

- `public/` is the app: an address bar, back/forward/reload, and a service worker for installing it to the home screen.
- `src/` is the Worker. It fetches pages, rewrites links so everything keeps flowing through it, keeps cookies per site, and serves a lightweight search page.
- Access is protected by a key that only you know.

## Setup

```sh
npm install
npx wrangler login
npx wrangler deploy
npx wrangler secret put PROXY_KEY   # choose any long random value
```

Open the deployed URL, enter your key once, then add the app to your home screen.

## Limits

Works best for ordinary pages. Sites that block cloud IP ranges, require heavy client-side scripting, or rely on streaming may not work.

## License

MIT
