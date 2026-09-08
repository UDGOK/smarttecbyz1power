# Deployment

Static output. No server runtime is required for the site itself — only the
lead-capture endpoint needs somewhere to run.

## Build

```bash
npm ci
npm run build      # -> dist/
```

Output is fully static: 7 HTML pages plus hashed assets under `dist/_astro/`.

## Hosting

Either works; pick one and set it up once.

**Cloudflare Pages**
- Build command `npm run build`, output directory `dist`
- Node 22
- Nothing else — there is no adapter and no SSR

**Vercel**
- Framework preset: Astro. Build `npm run build`, output `dist`
- Node 22

## Environment

Copy `.env.example` to `.env`. Every value in it is currently a placeholder;
the site builds and runs with all of them empty, and simply does less:

| Variable | Empty behaviour |
|---|---|
| `PUBLIC_RESERVE_ENDPOINT` | Capture forms accept input and show a confirmation, but post nothing |
| `PUBLIC_ANALYTICS_ID` | No analytics script is loaded at all |
| `PUBLIC_SITE_ORIGIN` | Falls back to the `site` value in `astro.config.mjs` |

## Caching

`dist/_astro/*` is content-hashed — cache immutably for a year. HTML should be
revalidated, since content changes without the asset hashes moving.

```
/_astro/*   Cache-Control: public, max-age=31536000, immutable
/*.html     Cache-Control: public, max-age=0, must-revalidate
```

## Performance budgets

Enforce these in CI before they drift:

| Metric | Budget |
|---|---|
| Critical JS, gzip | 60 KB |
| Any single deferred stage chunk, gzip | 15 KB |
| Three.js chunk, gzip | 130 KB |
| HTML per page | 20 KB |
| Media bytes above the fold | 0 |

The last line is a real constraint, not an aspiration: every world is a shader,
so there is nothing to download before the first screen is meaningful.

## What is not wired

- `POST /api/reserve` does not exist. The capture bar and the contact form
  validate and confirm client-side only.
- No analytics, no error monitoring, no CMS.
- No audio files; every track is a WebAudio synth voice.
