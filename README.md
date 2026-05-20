# CV Forge

A privacy-first CV/resume builder that compiles LaTeX to PDF entirely in your browser using BusyTeX XeLaTeX WebAssembly. No backend — all data stays in localStorage.

## Development

```bash
npm install
npm run dev       # http://127.0.0.1:5173
npm run test      # run unit tests
npm run build     # type-check + production build
npm run deploy    # build and deploy dist/ to Cloudflare Pages with Wrangler
```

## Browser LaTeX Runtime

The browser runtime is fully hosted from `public/`:

- `public/core/busytex` — BusyTeX JavaScript, worker, package index, and chunked WASM/basic TeX Live data.
- `public/core/texmf` — supplemental `fontspec`, `xcolor`, `ctex`, `xeCJK`, `zhnumber`, and layout package files needed by the generated template.
- `public/fonts/latex` — Latin, Chinese, and Japanese fonts written into BusyTeX before compile.

Cloudflare Pages has a 25 MiB per-file asset limit. The oversized BusyTeX files are therefore split into `public/core/busytex/chunks/*` by:

```bash
npm run assets:split
```

If you redownload BusyTeX assets, run:

```bash
npm run assets:download
```

This downloads the stock BusyTeX assets, keeps the checked-in `fontspec`/`xcolor` supplemental files, prunes the unused recommended/extra packs, and chunks the remaining oversized files. The app still requests the original BusyTeX URLs such as `/core/busytex/texlive-basic.data`; `public/service-worker.js` reconstructs those responses from the hosted chunks and caches them for offline use.

## Deploy to Cloudflare Pages

The project is pre-configured for Cloudflare Pages via `wrangler.jsonc` (output directory: `./dist`).

### Wrangler CLI

1. Authenticate once:
   ```bash
   npx wrangler login
   ```
2. Deploy:
   ```bash
   npm run deploy
   ```

`npm run deploy` uses Wrangler 4 and deploys `./dist` to the `cv-web` Pages project. If you rename the Pages project, update the `--project-name` value in `package.json`.

### Git Integration

1. Push this repo to GitHub/GitLab.
2. In Cloudflare Dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
3. Select the repo and configure:
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
   - **Node.js version**: set via `NODE_VERSION` env var if needed (20+)
4. Every push to the configured branch will trigger a deploy. Preview deployments are created automatically for PRs.

## Deployment Notes

`public/_headers` configures caching and security headers that Cloudflare Pages serves automatically:

- BusyTeX assets, chunk files, supplemental TeX files, and fonts are cached immutably for 1 year.
- Global `X-Content-Type-Options: nosniff` and `Referrer-Policy: no-referrer`.

The BusyTeX dependency is `AGPL-3.0-or-later`; the license text is in `public/licenses/BusyTeX-AGPL-3.0.txt`. Supplemental TeX Live files remain under the TeX Live/LPPL license text in `public/licenses/TeXLive-LPPL-1.3c.tex`.
