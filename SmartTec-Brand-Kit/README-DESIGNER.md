# SmartTec by Z1Power — designer handoff

Approved direction: the architectural S, green connecting core, and matching SmartTec wordmark. This kit was saved on September 8, 2026.

Open **START-HERE.html** for a visual directory. Open **previews/approved-particle-preview.html** for the self-contained interactive preview; it works directly from disk. The production website example uses modules and should be served over HTTP.

## Choose the right file

| Use | File |
| --- | --- |
| Main logo on dark backgrounds | `logos/svg/smarttec-lockup-offwhite-green.svg` |
| Main logo on light backgrounds | `logos/svg/smarttec-lockup-forest-green.svg` |
| Compact navigation wordmark, no endorsement | `logos/svg/smarttec-wordmark-offwhite-green.svg` |
| Standalone S mark | `logos/svg/smarttec-symbol-offwhite-green.svg` |
| Black or white print artwork | Matching `-black.svg` / `-white.svg` files |
| Transparent raster logo | Matching files in `logos/png/` |
| Browser favicon | `icons/favicon.svg` or `icons/favicon.ico` |
| Apple touch icon | `icons/smarttec-icon-180.png` |
| Website particle animation | Files in `website/` |
| Conference/background loop | `animated/smarttec-energy-loop-1920x1080.mp4` |
| Particle formation intro | `animated/smarttec-particle-reveal-1920x1080.mp4` |
| Transparent moving overlay | `animated/smarttec-energy-transparent-1200x630.webm` |
| Animated GIF | `animated/smarttec-energy-loop-960x540.gif` |
| Static website link preview | `social/smarttec-og-1200x630.png` (JPG also included) |
| Square social post | `social/smarttec-social-loop-1080x1080.mp4` |
| Vertical story/reel | `social/smarttec-story-loop-1080x1920.mp4` |
| Square GIF | `social/smarttec-social-loop-640x640.gif` |

The PNG logo exports are transparent. Full lockups and wordmarks are supplied at 1200 and 2400 pixels wide; symbols at 256 and 1024 pixels. SVGs contain editable outline paths, not embedded bitmap images or live fonts. Their curves were traced and smoothed from the approved artwork. Compare with `source/approved-concept.png` during any final optical refinement for very large signage.

## Brand treatment

- Forest: **#1C4839**.
- Signal green: **#7BE88A**.
- Off-white: **#EEF1EF**.
- Ink: **#141414**.
- Keep proportions locked. Keep the green element inside the S in the same position.
- Suggested minimum clear space: the height of the green core on every side.
- Use the main wordmark without the endorsement when “by Z1Power” would be too small to read. Use the standalone S for favicons and very small badges.
- The logo itself stays flat. Glow belongs to the moving particles, not the permanent letterforms.

## Website integration

The `website/` files are a dependency-free Canvas animation. They include the particle renderer, a lifecycle wrapper, CSS, a transparent logo PNG, and an example page. No Codex runtime is needed.

1. Copy the contents of `website/` into `public/assets/smarttec/` in the Astro project.
2. Add the stylesheet and a sized container to the intended page:

```html
<link rel="stylesheet" href="/assets/smarttec/smarttec-particles.css" />
<div id="smarttec-logo" class="smarttec-particle-stage"></div>
<button id="smarttec-pause" type="button">Pause animation</button>
<script type="module">
  import { mountSmartTec } from '/assets/smarttec/smarttec-particles.mjs';
  const animation = await mountSmartTec(document.getElementById('smarttec-logo'), {
    intensity: 'website', // or 'conference'
    formation: true,
    speed: 1
  });
  let paused = false;
  document.getElementById('smarttec-pause').addEventListener('click', (event) => {
    paused = !paused;
    paused ? animation.pause() : animation.play();
    event.currentTarget.textContent = paused ? 'Play animation' : 'Pause animation';
    event.currentTarget.setAttribute('aria-pressed', String(paused));
  });
  window.addEventListener('pagehide', () => animation.destroy(), { once: true });
</script>
```

The wrapper honors reduced-motion preferences, caps display pixel density at 2×, and pauses when the page is hidden or the element is off screen. Keep a visible pause control for persistent motion. For SPA/client-side navigation, call `destroy()` before removing the container and remount after navigation. Assets should be same-origin; if using a CDN, configure image CORS.

For particles over an existing scene, set `transparent: true` and add `data-transparent` to the container. The PNG and SVG files remain useful as static fallbacks. A WebM with alpha is included, but support for alpha video varies by browser/player; the Canvas version is the primary website implementation.

## Share previews versus animated posts

Use `social/smarttec-og-1200x630.png` for a normal shared website URL. Upload the MP4 or GIF separately when the social post itself should animate. Link preview behavior is controlled by the receiving app; animation is not guaranteed by pointing `og:image` at a GIF. The Open Graph protocol has separate image and video metadata: <https://ogp.me/>.

Copy the static image into `public/assets/smarttec/` and add to the page head:

```html
<meta property="og:image" content="https://smarttecbyz1power.vercel.app/assets/smarttec/smarttec-og-1200x630.png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:type" content="image/png" />
<meta property="og:image:alt" content="SmartTec by Z1Power — data centers and colocation" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:image" content="https://smarttecbyz1power.vercel.app/assets/smarttec/smarttec-og-1200x630.png" />
<meta name="twitter:image:alt" content="SmartTec by Z1Power — data centers and colocation" />
```

Use the actual production domain if it changes. The static JPG is an alternative to PNG, not another mandatory download. Preview cards do not state unconfirmed capacity or availability claims.

## Motion specifications

- MP4s: H.264, 24 fps, silent, 12 seconds, web-optimized for progressive playback.
- Continuous clips repeat on a deterministic 12-second cycle. They start with the readable logo, which also gives a useful first-frame fallback.
- The reveal clip gathers particles into the wordmark, then continues the energy flow. It is an intro, not a seamless loop.
- GIFs: 12 fps, 12 seconds, 128-color palette, repeat indefinitely.
- Transparent overlay: VP9 WebM with alpha, 1200 × 630, 24 fps, 12 seconds.
- “Electron/neutron” motion is a brand metaphor for data and energy, not a physics simulation.

## Source and reproduction

`source/approved-concept.png` is the approved reference image. `source/approved-logo-keyed.png` is the transparent raster used to trace the vectors. `source/logo-geometry.json` contains the traced paths. `source/export-assets.mjs` regenerates logo variants and icons; `source/export-media.mjs` regenerates posters and videos from the same renderer used on the website.

From `source/`, install the dependencies listed in `package.json`, then run `npm run logos`. Install FFmpeg and make it available on PATH, or set `SMARTTEC_FFMPEG` to its absolute path; then run `npm run media`. Caption text is rasterized using Arial or the host's sans-serif fallback; the actual SmartTec wordmark is outlined artwork and requires no font installation.

This handoff folder does not automatically replace the live site's navigation logo, favicon, metadata, or scene. Those integration choices remain with the designer.
