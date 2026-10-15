# CV Forge

A privacy-first CV/resume builder that compiles LaTeX to PDF entirely in your browser using BusyTeX XeLaTeX WebAssembly. No backend — all data stays in localStorage.

## Editor

- **Live preview** — auto-compiles a moment after you stop typing (toggle “Auto”), keeps the previous PDF on screen while compiling, and follows the section you select. Zoom, fit-to-width and page navigation float over the preview.
- **Layout check** — after each compile, the dock under the preview lists page gaps, nearly empty last pages and short last lines; sections with suggestions are flagged in the outline.
- **List editing** — Enter adds a bullet or item (splitting at the caret), Backspace at the start joins with the previous one, Alt+↑/↓ reorders, and pasting several lines splits them into items.
- **Formatting shortcuts** — Ctrl/⌘+B, I and E wrap the selection in `**bold**`, `_italic_` and `` `code` ``.
- **Undo/redo**, drag-to-reorder sections, collapsible entries, a resizable editor/preview split, and named versions of each CV (Ctrl/⌘+S).

## Development

```bash
npm install
npm run dev       # http://127.0.0.1:5173
npm run test      # run unit tests
npm run build     # type-check + production build
npm run deploy    # build and deploy dist/ to Cloudflare Workers (static assets) with Wrangler
```

## Browser LaTeX Runtime

The browser runtime is fully hosted from `public/`:

- `public/core/busytex` — BusyTeX JavaScript, worker, and package index.
- `public/core/texmf` — supplemental `fontspec`, `xcolor`, `ctex`, `xeCJK`, `zhnumber`, and layout package files needed by the generated template.
- `public/fonts/latex` — Latin, Chinese, and Japanese fonts written into BusyTeX before compile.
- `public/core/packs` — the WASM, TeX Live data and large fonts, gzipped and split into parts.
- `public/core/runtime-manifest.json` — every runtime file with its size, content hash and parts.

These are built from the BusyTeX release in `vendor/busytex`:

```bash
npm run assets:download   # fetch the BusyTeX release into vendor/, then build
npm run assets:build      # rebuild public/ from vendor/ (after changing the template, fonts or TeX files)
```

The build trims BusyTeX's 87 MiB TeX Live package to the ~7 MiB this template uses: it runs the engine in Node on the CVs in `scripts/coverage-cvs.ts`, keeps the files they touch, shrinks ICU's data with `icupkg` (`brew install icu4c`), and fails unless every CV compiles to a byte-identical PDF. Large binaries are then gzipped into parts, since Cloudflare limits static assets to 25 MiB and does not compress `.data`, `.ttc` or split files.

On first use the app downloads what the CV needs (the Chinese and Japanese fonts only when those languages are on), showing progress, and keeps it in Cache Storage under content-hashed keys, resuming after a reload; later visits, and deploys that do not change the engine, download nothing. The app still requests the original URLs such as `/core/busytex/texlive-basic.data`; `public/service-worker.js` answers them from that cache.

## Deploy to Cloudflare Workers

The project deploys as a static-assets-only Worker (assets directory: `./dist`, single-page-application fallback). No Worker script runs, so requests are served directly from the asset store. `wrangler.jsonc` is gitignored so it can hold your own domain; create it from the example:

```bash
cp wrangler.example.jsonc wrangler.jsonc   # then set routes to your domain, or remove them
```

### Wrangler CLI

1. Authenticate once:
   ```bash
   npx wrangler login
   ```
2. Deploy:
   ```bash
   npm run deploy
   ```

`npm run deploy` runs `wrangler deploy`, which deploys `./dist` to the `cv-web` Worker. The `routes` entry in `wrangler.jsonc` attaches a custom domain (its zone must be on your Cloudflare account); without it the Worker is served on `*.workers.dev`.

### Git Integration

1. Push this repo to GitHub/GitLab.
2. In Cloudflare Dashboard → **Workers & Pages** → **Create** → **Import a repository** (Workers Builds).
3. Select the repo and configure:
   - **Build command**: `npm run build`
   - **Deploy command**: `npx wrangler deploy`
4. Every push to the configured branch will trigger a deploy.

## Deployment Notes

`public/_headers` configures caching and security headers that Cloudflare serves with the static assets:

- BusyTeX assets, packed parts, supplemental TeX files, and fonts are cached immutably for 1 year; the runtime manifest is always revalidated.
- Global `X-Content-Type-Options: nosniff` and `Referrer-Policy: no-referrer`.

The BusyTeX dependency is `AGPL-3.0-or-later`; the license text is in `public/licenses/BusyTeX-AGPL-3.0.txt`. Supplemental TeX Live files remain under the TeX Live/LPPL license text in `public/licenses/TeXLive-LPPL-1.3c.tex`.
