# RArgu OS

The personal site of Rodrigo Arguello at https://rargu.dev. It is one blueprint sheet that the visitor pans and
zooms. Each project is a live window on the sheet, and the visitor can drag, throw and pin the windows. An overlay
card on the left gives the name, the links and the resume.

The sheet has eight windows:

- **CastleSiege**: the owner's strategy game, with its real engine and bot.
- **Castle Wars**: a sprite viewer for the auto-battler art (work in progress).
- **Pentimento**: a scripted sketch (work in progress).
- **Focused Web Crawler** and **Insider Trading**: demos with simulated data.
- **Paint**, **Music** (Tracker) and **Notes** (Writer): the quick tools.

The site is static. It has no server code, no accounts and no browser storage. Files that a visitor makes stay in
memory until the page reloads, or the visitor downloads them.

The approved layout is the mock in [`docs/mockups/`](docs/mockups/README.md). The changes and their status are in
[`docs/specs/`](docs/specs/README.md). See [`docs/README.md`](docs/README.md) for the documentation map.

## Run it locally

Node 22.18 or newer is necessary (the build scripts are TypeScript that Node runs directly).

```bash
npm install
npm run dev
```

Then open the URL that Vite prints.

| Command | What it does |
|---|---|
| `npm run dev` | builds `resume.html`, then starts the Vite dev server |
| `npm run build` | builds `resume.html`, type-checks and builds the static site into `dist/` |
| `npm run preview` | serves `dist/` |
| `npm run lint` | ESLint and a Prettier check |
| `npm run format` | Prettier writes the formatting |
| `npm test` | unit tests (Vitest) |
| `npm run e2e` | end-to-end tests in Chromium, desktop and phone emulation (Playwright) |
| `npm run e2e:all` | the same tests in Chromium, Firefox and WebKit |
| `npm run e2e:routing` | redirect and 404 checks on a local `wrangler dev --local` of a new `dist/` (port 8799) |
| `npm run image` | builds `resume.html` from `content/resume.md` (`dev`, `build` and `test` run it for you) |
| `npm run gen:assets` | draws the app icons and the shared icons again |
| `npm run deploy` | builds and runs `wrangler deploy`. Gated: only with the owner's OK |
| `npm run deploy:live` | records the live version, deploys, runs the live checks, rolls back on a failure. Gated: only with the owner's OK |

The first e2e run needs the browsers: `npx playwright install chromium firefox webkit`. `resume.html` is a
generated file and is not committed.

## How it is put together

```
index.html             the sheet page: overlay card, viewport, minimap
src/sheet/             the sheet: pan, zoom, minimap, window drag and throw, layout
src/sheet/demos/       the demo windows: Castle Wars, Pentimento, crawler, insider
src/sheet/host/        the app host: runs a hosted app inside a sheet window
src/apps/castlesiege/  hosted app: CastleSiege (engine, bot, music)
src/apps/paint/        hosted app: Paint
src/apps/tracker/      hosted app: Tracker (the Music window)
src/apps/writer/       hosted app: Writer (the Notes window)
src/apps/lib/          helpers shared by the hosted apps (downloads, palette, Help and About)
src/apps/resume/       Markdown and frontmatter module for resume.html
src/apps/castlewars/   the Castle Wars sprite sheets (PNG and Aseprite JSON)
src/sdk/os.d.ts        the interface that the hosted apps are written against
src/ui/                tokens, base styles, menus and widgets that the hosted apps use
system/                read-only files for the hosted apps: themes, icons, songs, the demo song
content/               the owner's content (identity, resume, projects, work, writing)
public/                fonts, sheet images, _redirects, _headers, 404.html
scripts/               build plugins and generators (see below)
tests/unit, tests/e2e  Vitest and Playwright tests
```

The hosted apps load as lazy chunks when the visitor opens their window. The host gives each app a small `OS`
object and an in-memory filesystem that `scripts/host-resources.ts` fills from `system/`.

`scripts/`:

- `sheet-content.ts`: writes the overlay card and the project text into the page from `content/`.
- `host-chunks.ts`, `host-css.ts`, `host-resources.ts`: the app host's chunks, scoped CSS and files.
- `castlewars-frames.ts`: the Castle Wars frame data.
- `sheet-guard.ts`: fails the build if the sheet bundles old-OS code or a third-party URL.
- `build-resume-html.ts`: `resume.html`. `gen-icons.ts`: the icons. `deploy-live.ts`: the gated deploy.

## Change content

The site text about the owner is in `content/`:

- `identity.json`: name, title, tagline, links. The overlay card uses it.
- `projects/*.md`: one file for each project window. `scripts/sheet-content.ts` has the list and the order.
- `resume.md`: the resume. It becomes the static page `/resume`.

Edit a file, then run `npm run dev` to see the change.

## Tests

- `npm test`: the sheet (physics, gestures, visibility, content, the build guard), the app host (filesystem, `OS`
  object, windows, dialogs, shortcuts, CSS), the demos, Paint, Tracker, CastleSiege (engine, bot, session, music),
  themes, names and the deploy script.
- `npm run e2e`: builds the site and drives it in Chromium and phone emulation: pan and zoom, windows, the overlay
  card, each hosted app and demo, accessibility and performance checks.
- `npm run e2e:routing`: the `public/_redirects` rules and the 404 page.
- `E2E_BASE_URL=https://rargu.dev npx playwright test …` runs the e2e tests against the live site.

## Deploy

The site is the Cloudflare Worker `rargu-devpage` with static assets and no script (`wrangler.jsonc`). `npm run
deploy` builds and runs `wrangler deploy`. It needs a `wrangler login` for the account. `npm run deploy:live` does
the same with live checks and an automatic rollback (`scripts/deploy-live.ts`).

**WARNING:** Run `npm run deploy` or `npm run deploy:live` only with the owner's OK (gate G-deploy in `AGENTS.md`).
Both change the live site.

`www` goes to the apex by a zone rule outside this repo. `public/_redirects` sends `/next` and the old site's pages
to `/`. `public/404.html` answers unknown paths. `public/_headers` sets the cache for the hashed bundles. `npx
wrangler deployments list --name rargu-devpage` shows the versions. `npx wrangler rollback <version-id> --name
rargu-devpage` restores one.

## History

Before RArgu OS, this repo was DevPageOS, a browser OS with a kernel, a filesystem and a window server. Its code is
in the local git tag `devpageos-final`. Its docs are in `docs/archive/`, which is local only (not in the public
repo).

## Licenses

- Pixel Operator fonts: CC0 (`public/fonts/LICENSE.txt`).
- Instrument Sans: SIL Open Font License (`public/fonts/InstrumentSans-OFL.txt`).
- `marked`: MIT.
- Icons, sprites and songs were made for this project.
- CastleSiege's engine, bot and sprites are the owner's own, vendored from the CastleSiege repository
  (`src/apps/castlesiege/VENDOR.md`).
