# Twitter Offline

A personal PWA for reading your X/Twitter feed offline — full tweet text, photos,
and video, cached entirely on-device. Built for iPhone (Safari "Add to Home
Screen"), but works in any modern browser.

**Live app:** https://captaincomplex.github.io/twitter-offline/

## How it works

X doesn't offer a free API for reading a home timeline, and there's no
server here to hold API credentials anyway — everything runs client-side.
So capture works like this:

1. A **bookmarklet** you run while browsing `x.com` patches `window.fetch`
   in that page to read the GraphQL responses X's own app already makes as
   you scroll. It never touches your password or session token directly —
   it just inspects data your browser already received.
2. It walks each response for tweet-shaped objects (works on Home, a
   profile, Bookmarks, a thread — anywhere tweets flow through a
   `/graphql/` response) and extracts full text (including long-form
   "note tweets"), author info, and photo/video URLs.
3. Tapping **Save & Download** in the bookmarklet's on-page panel exports
   everything captured as a JSON file.
4. The app's **Import** tab reads that file, saves tweet metadata to
   IndexedDB, and fetches + caches every photo/video into the Cache
   Storage API so they render with zero network access afterward.
5. A service worker caches the app shell itself, so the whole thing —
   UI, tweets, media — opens and works with no connection.

This relies on X's undocumented internal API, which is against X's Terms
of Service. It's meant for personal, occasional use to save your own feed
for offline reading — not for bulk scraping or redistribution. X may
change its app in ways that break the parser at any time.

## Using it

1. Open the live app, go to **Import → Get the bookmarklet**, and follow
   the on-page setup instructions (there's a copy-paste flow for iOS
   Safari, since bookmarks can't be dragged there).
2. On `x.com`, open the bookmarklet, scroll your timeline to load tweets,
   then tap **Save & Download**.
3. Back in the app's **Import** tab, choose the downloaded file.
4. Read the **Feed** tab — works offline once media finishes caching.

Add the app to your iPhone home screen (Share → Add to Home Screen) for
the full standalone-app feel.

## Files

| File | Purpose |
|---|---|
| `index.html` / `app.js` / `db.js` | The app: tab UI, IndexedDB + Cache Storage layer, import flow |
| `sw.js` | Service worker: offline app shell + runtime media caching |
| `manifest.json` | PWA manifest |
| `bookmarklet.js` | Readable source for the capture bookmarklet |
| `bookmarklet.html` | Install page with the packaged `javascript:` bookmarklet and setup steps |
| `icons/` | App icons |

## Known limitations

- Capture is manual and incremental — there's no background sync; you
  re-run the bookmarklet whenever you want fresh tweets.
- Some media hosts may not allow cross-origin fetches from this app's
  origin, in which case that item is skipped during caching (shown as a
  failure count after import) and will only load while online.
- If X changes the shape of its GraphQL responses, the parser in
  `bookmarklet.js` may need updating — it's intentionally simple and
  dependency-free so that's a small, self-contained fix.
