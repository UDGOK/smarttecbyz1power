# Deployment

Static output. No server runtime is required for the site itself — only the
lead-capture endpoint needs somewhere to run.

## Build

```bash
npm ci
npm run build      # -> dist/
```

Output is fully static: 7 HTML pages plus hashed assets under `dist/_astro/`.

## Hosting — Vercel

`vercel.json` is committed and carries the build settings and cache headers,
so the project needs no dashboard configuration beyond connecting the repo.

```bash
npm i -g vercel
vercel link          # once, to connect this directory to the project
vercel --prod        # or just push to main once the Git integration is on
```

- Framework preset resolves to Astro; build `npm run build`, output `dist`
- Set Node to 22 in Project Settings → General → Node.js Version
- Static output, no adapter, no SSR, no serverless functions

Environment variables go in Project Settings → Environment Variables. Every
one of them is optional today — see the table below.

## Environment

Copy `.env.example` to `.env`. Every value in it is currently a placeholder;
the site builds and runs with all of them empty, and simply does less:

| Variable | Empty behaviour |
|---|---|
| `PUBLIC_RESERVE_ENDPOINT` | Capture forms accept input and show a confirmation, but post nothing |
| `PUBLIC_ANALYTICS_ID` | No analytics script is loaded at all |
| `PUBLIC_SITE_ORIGIN` | Falls back to the `site` value in `astro.config.mjs` |

## Caching

Handled by `vercel.json`. `dist/_astro/*` and `/assets/fonts/*` are
content-addressed or stable, so both are served immutable for a year; HTML
revalidates, since content changes without the asset hashes moving.

## Performance budgets

Enforce these in CI before they drift:

| Metric | Budget | Now |
|---|---|---|
| Entry script + GSAP, gzip | 40 KB | ~36 KB |
| Three.js chunk, gzip | 130 KB | 127 KB |
| Any single stage chunk, gzip | 12 KB | 7.4–9.9 KB |
| Configurator chunk, gzip | 14 KB | 11.1 KB |
| HTML per page, gzip | 12 KB | 7.3–8.4 KB |
| Media bytes above the fold | 0 | 0 |

Two notes on how to read this.

**Three.js is fetched immediately, not on idle.** The entry gate is a
transparent overlay and the visitor draws over the live world, so the 3D scene
*is* the first screen — deferring it would mean gating on a blank panel. It is
still a separate chunk and still does not block the entry script; we simply
stop waiting for idle before requesting it. First-screen JavaScript is
therefore about 170 KB gzip, and that is a deliberate trade, not an oversight.

**Measure HTML gzipped, not raw.** The homepage is 53 KB raw because the
configurator server-renders all five questions, all twenty cards and a no-JS
spec-sheet fallback. That is the right call for search engines and for anyone
with JavaScript blocked, and it compresses to 8.4 KB, which is what actually
crosses the wire. Vercel serves it compressed by default.

The zero on the last line is a real constraint, not an aspiration: every world
is a shader, so there is nothing to download before the first screen is
meaningful.

## What is not wired

- `POST /api/reserve` does not exist. The capture bar and the contact form
  validate and confirm client-side only.
- No analytics, no error monitoring, no CMS.
- No audio files; every track is a WebAudio synth voice.
- Three licensed display faces are not in the repo. See
  `public/assets/fonts/README.md` — dropping them in needs no code change.
