# Mission: an alternative web client for discover.fm, in Declare

Reproduce **discover.fm** — a music-curation site — as a Declare application, for
everything a signed-out visitor can see and do. The goal is a pixel-faithful
alternative client: same layout, same type, same assets, same interactions,
loading its dynamic data and images from the live site.

This is a private local engineering experiment in how far Declare can be pushed
toward replicating a real production site. It is not for publication.

## The target

https://discover.fm — live, reachable from this machine. Signed-out surface:

- **Home** (`/`): a phone-shaped column centered on a paper background; a
  full-bleed hero carousel (5 slides, dot indicators) with torn-paper black
  labels, distressed display type, a red BROWSE CURATORS button, a SIGN IN
  button (chrome only — sign-in itself is out of scope), a hamburger menu, and
  a bottom BROWSE bar.
- **Browse** (`/browse`): FEATURED / TOP / NEW tabs of curator cards — portrait,
  name, follower count, playlist title, updated date, featured artists.
- **Curator pages** (`/allison`, `/kayvanmd`, `/tpc`, `/michael`, and any the
  browse page links): portrait, name, visit count, bio, hero panels, FOLLOW FOR
  UPDATES chrome, and the playlist with per-track art from Spotify's CDN.
- Privacy and terms pages exist; a static placeholder for each is fine.

Out of scope: anything behind Clerk sign-in, analytics, and actual audio playback.

## Facts from recon (in `task/recon/`)

- `home.png`, `browse.png`, `curator.png` — 2× screenshots at 1440×900.
- `recon.json`, `recon2.json` — request inventories, link map, font stacks.
- Fonts: **Anton** (display) and **Work Sans** (text) — both on Google Fonts.
- There is **no public JSON API**. The site is Next.js/RSC; page data is embedded
  in the HTML payloads. Images resolve through `/_next/image?url=…` to
  `cdn.discover.fm` and `image-cdn-*.spotifycdn.com` — those URLs hot-link fine.
- **CORS will block** a browser app fetching discover.fm HTML cross-origin. A
  minimal local relay is sanctioned infrastructure for this experiment: a small
  node script (e.g. `task/relay.mjs`, port **8330**) that fetches a discover.fm
  page server-side and returns extracted JSON. Keep it dumb — fetch, extract,
  return; all rendering logic belongs in the Declare app. Cache aggressively so
  you are polite to the live site: hit each page at most once per run.

## The bar

**Pixel-level.** Use puppeteer (devDependency of this repo) to compare your
render against the live site at the same viewport, side by side, iteratively.
Get the type right (family, size, weight, tracking, the distressed treatment),
the torn-label geometry, the spacing, the carousel behaviour, hovers and
presses, the phone-column-on-paper page shape at desktop widths, and the real
data: live curator names, counts, artwork.

Interactions to match: carousel advance and dots, tab switching on browse,
menu open/close, navigation between pages (deep links should work — `/allison`
in the URL bar lands on that curator), hover/press states on buttons and cards.

## Delivering it

- The app: `my-apps/dfm.declare` (include-split into more files under `my-apps/`
  if size demands, but prefer one).
- The relay (if you build one): `task/relay.mjs`, port 8330.
- Dev server: `npm start 8208` → http://localhost:8208/my-apps/dfm.declare
- Do not use ports 8200–8207, 8310, or 8320.
- Check your work with `node tools/verify.mjs my-apps/dfm.declare`, and drive it
  with `--assert`. Side-by-side pixel comparison is yours to script with
  puppeteer against the live site.

When done, report: what is faithfully reproduced and what is approximated (be
specific — name every knowing deviation); how the data path works; where the
time went; and anything in Declare, its documentation, or its diagnostics that
was wrong, missing, or misleading for THIS kind of work — a replication job is
different pressure than a greenfield app, and that difference is data.
