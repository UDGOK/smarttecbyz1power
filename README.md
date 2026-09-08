# SmartTec by Z1Power

AI data center site for **Site 01 — Mead, Oklahoma** (8460 US-70, Mead, OK 73449).

Design system, motion language and interaction vocabulary are modelled on
[why.zero.university](https://why.zero.university). Copy, branding and 3D are
original — nothing is lifted from the reference.

---

## Status

All five stage worlds, the campus explorer, the configurator and the six
content pages are built. What remains is real assets and real endpoints.

| Built | Outstanding |
|---|---|
| Design tokens, chrome layer, stage machine, scene host | Real audio files (every track is a WebAudio synth) |
| Entry gate, custom cursor, film grain, flash ripple | Photography — the site ships no invented imagery |
| Hold-to-advance scrubbing world, audio, chrome and veil | Form endpoint, analytics, hosting |
| Five procedural WebGL worlds, each its own chunk | 73 marked `[PLACEHOLDER]` facts across the content pages |
| Explorable campus with clamped orbit, pinch zoom, hotspots | Licensed display fonts, if pixel-exact type is wanted |
| Deployment configurator, keyboard-operable, no-JS fallback | |
| Six content pages, every figure imported from the record | |
| Static reading path, reduced-motion path, WebGL fallback | |

## Run

```bash
npm install
npm run dev      # http://localhost:4321
npm run build
npm run preview
```

## Architecture

**Astro + TypeScript + Three.js + GSAP.** Astro was chosen over the reference's
pure Vite SPA for one stated reason: this site must rank for colocation and
GPU-capacity searches, and needs server-rendered HTML per page. The rendering
technology is identical to the reference — the difference is routing and output.

```
src/
  data/site.ts              Content model. Every published figure lives here.
  styles/tokens.css         Colour, type, space, radii, motion tokens.
  styles/global.css         Reset, skip link, hold-button styles.
  layouts/Base.astro        Document shell, meta, fonts.
  components/chrome/        Floating UI: ruler, badge, brandmark, capture bar.
  lib/
    boot.ts                 Stage wiring — the contract every stage plugs into.
    hold-button.ts          Hold-to-advance. Scrubs, does not merely trigger.
    audio.ts                Ambience + FX bus, WebAudio synth until assets land.
    quality.ts              Adaptive HIGH/MEDIUM/LOW tiers from frame timing.
    scene/experience.ts     Procedural terrain shader. Code-split, idle-loaded.
```

### Component map

| Component | Role | Inverts with stage |
|---|---|---|
| `Brandmark` | Fixed top-left home link | yes |
| `ScrollRuler` | Stage position + jump nav, `-100 BP → 0 BP` | yes |
| `PowerBadge` | Counts kW of Phase 1A introduced | yes |
| `CtaBar` | Email capture + back control | no (always light) |
| `HoldButton` | Advances the stage by scrubbing it | yes |

Chrome inversion is a single token flip: `[data-chrome='dark']` in `tokens.css`.

## Storyboard

Ruler unit is **BP — Before Power-On**, counting down to Q4 2026.

| Stage | Ruler | World | Beat | Scroll | Mobile | Reduced motion |
|---|---|---|---|---|---|---|
| 1 · The Land | `-100 BP` | Muted field greens | 30 acres, already ours | 250vh | Lens to 58°, horizon lifted into lower third | Static terrain, click to advance |
| 2 · The Wait | `-75 BP` | Blood red | Everyone else is in a 4–7 year queue | 250vh | as above | as above |
| 3 · The Power | `-50 BP` | Low sun, gold | Behind the meter, so no queue to join | 300vh | Lens widened, horizon lifted | Sun and flow frozen, scene still complete |
| 4 · The Machine | `-25 BP` | Graphite, cyan heat | 64 Blackwells, liquid cooled | 300vh | Lens 52°→76°, aisle tightened, ~40 instances re-laid | LEDs hold a seeded static pattern, not a dark wall |
| 5 · The Campus | `0 BP` | Daylight | Explore the parcel, then size a deployment | 200vh | Isometric angle raised toward plan, fit distance recomputed | No idle drift; all interaction still works |

Stages 1 and 2 share one scene and scrub between palettes on a single uniform.
Crossings that change scene run behind a colour veil the hold scrubs, so a
scene swap still reads as one continuous move rather than a cut.

**The hold.** `onProgress(0..1)` drives the shader's world mix, the cross-fade
between two ambient tracks, the chrome tint and the power badge in one callback.
Releasing early rewinds all of them through `onCancel`. Keyboard users hold
Enter or Space; reduced-motion users get a single activation instead.

## Performance budget

| Metric | Budget | Now |
|---|---|---|
| Critical JS (gzip) | ≤ 60 KB | ~50 KB |
| Deferred 3D chunk (gzip) | ≤ 130 KB | 117 KB (three) + 3 KB (scene) |
| HTML | ≤ 20 KB | 11.4 KB |
| Media weight | ≤ 0 KB above the fold | 0 — the terrain is a shader |

Three.js is code-split and requested on `requestIdleCallback`, after the first
screen paints. Quality tiers downgrade above 22 ms/frame and upgrade below
12 ms, with a 180-frame cooldown.

## Accessibility

- Skip link, one `h1` per page, `aria-live` on ruler readout and power badge
- Hold works from the keyboard; reduced motion swaps it for a single activation
- `prefers-reduced-motion` freezes shader time and skips all reveals
- Static reading path in the DOM for crawlers and assistive tech
- No WebGL → CSS gradient is the complete picture, not a broken state

## Integration map

| Integration | Status |
|---|---|
| Lead capture endpoint | **[PLACEHOLDER]** `POST /api/reserve` not wired |
| Analytics | **[PLACEHOLDER]** not installed |
| CMS | Not required yet — content model is typed in `src/data/site.ts` |
| Hosting | **[OPEN]** Vercel or Cloudflare Pages, static output |

## Open items

1. **Audio assets.** Every track is a WebAudio synth placeholder. Drop real
   files into `public/assets/audio` and set `src` in `src/lib/audio.ts`.
2. **Photography.** The existing SmartTec policy is "real photographs or
   nothing" — site, building and Z1Power cabinet photos are needed for the
   content pages.
3. **Form endpoint and analytics** destinations.
4. **Domain** — `smarttec.z1power.com` assumed in `astro.config.mjs`.
5. **Logo** — the brandmark is a placeholder wordless glyph pending real assets.

## Content sources

All figures in `src/data/site.ts` come from the existing SmartTec site record
and were confirmed as authoritative by the owner: 30 acres, 3 × 3,000 sqft
buildings, 3 MVA @ 208V three-phase, ~$0.08/kWh, Dobson 100 Gbps DIA at
$8,075/month on a signed 60-month quote, ~500 kW planned solar, 8 × NVIDIA HGX
B200 / 64 GPUs / 60 rentable / ~114 kW, Q4 2026 power-on.
