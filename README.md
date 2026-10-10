# Vrows

A small installable web app (PWA) for simple browsing through your own free Cloudflare Worker. Type an address or a search, and pages are fetched by the Worker and shown in the app.

## How it works

- `public/` is the app: a dark galaxy home page, an address bar, a bottom bar with back/forward/home/bookmark/menu, and a service worker for installing it to the home screen.
- `src/` is the Worker. It fetches pages, rewrites links so everything keeps flowing through it, keeps cookies per site, and serves a lightweight search page.
- Also: bookmarks and history (kept in your browser only), full screen and rotate for video, a button to save plain video/audio files found on a page, and ad/tracker blocking.
- Optionally protected by an access key (set `PROXY_KEY`); without one, anyone with the address can use it.

## Setup

```sh
npm install
npx wrangler login
npx wrangler deploy
```

Open the deployed URL and add the app to your home screen.

To require a key, run `npx wrangler secret put PROXY_KEY` with any long random value; the app asks for it once.

## Limits

Works best for ordinary pages. Sites that block cloud IP ranges, require heavy client-side scripting, or rely on streaming may not work.

## License

MIT
