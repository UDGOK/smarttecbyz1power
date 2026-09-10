# SmartTec cinematic release

The owner approved the cinematic menu, compute and campus concepts and requested
implementation across the site, with the existing top-left logo kept exactly the
same. This release preserves `SiteHeader.astro`, `Brandmark.astro` and the header's
geometry stylesheet. No new fonts, packages, environment settings or API keys are
required.

## What visitors see

| Page | Visual story and interaction |
| --- | --- |
| Home | One centered approved lockup and Enter link; the cinematic journey begins after activation. No particle-logo overlap or automatic dismissal. |
| Global menu | Page list with a large image preview, updated by pointer hover or keyboard focus. Real links remain the navigation; the mobile list stays readable. |
| Site | Campus artwork with land, buildings and expansion topics; brightness and illustrative energy-path controls. |
| Power | Storage/solar artwork with distribution, storage and solar topics. Energy paths are explicitly illustrative. |
| Colocation | Hardware artwork with customer equipment, facility requirements and connectivity topics. |
| Compute | Open-server artwork with GPU modules, workload fit and expansion topics. The existing eight-GPU plan is unchanged. |
| Planner | Compact hardware opening and immediate link to the working planner; optional concept explorer. |
| News | Compact energy opening; sourced articles remain the main content. |
| About | Campus artwork explaining the starting point, delivery approach and roadmap. |
| Contact | Compact campus opening with the existing inquiry form accessible directly. |
| Investor room | Matching campus opening and topic controls, followed by the existing protected survey-based model, map, calculator and questions. |
| Investor login | Matching public concept backdrop behind the existing protected-access form. No private asset is exposed. |
| Brand gallery | Compact material backdrop; the official artwork/downloads and unlisted status are retained. |

The cinematic images are AI concept illustrations, not facility photographs,
survey geometry, installed inventory, or OEM drawings. The investor survey model
and satellite map remain the appropriate places to inspect project geometry.
The new public artwork is separate from the private reference documents/assets.

## Interaction and performance

- Pointer movement subtly shifts the artwork only. Header ancestors are never
  transformed. Touch and reduced-motion visitors receive a steady view.
- Topic buttons and numbered callouts display real explanatory text. Energy
  paths and brighter view change the presentation; they are not live telemetry.
- Public WebGL opens only through **Explore in 3D**, including on desktop.
  Closing or failing the renderer restores the artwork. Hidden menu/tab and
  page navigation pause or release work.
- Mobile artwork and controls use intrinsic content height so enlarged text can
  wrap. Navigation excludes CSS-hidden controls from the keyboard focus loop.
- Homepage boot/Three.js is dynamically imported after Enter. The existing
  configurator has its own initial script; this release does not claim all
  animation libraries are deferred.
- Three responsive WebP pairs are included. Desktop assets total 477,588 bytes;
  the 800px assets total 151,048 bytes. Each page uses one appropriate scene.
  Menu art is requested when the menu is opened on a sufficiently wide screen.

## Maintenance map

| File | Responsibility |
| --- | --- |
| `src/data/cinematic.ts` | Route artwork, topic text and concept labels |
| `src/components/CinematicArt.astro` | Shared responsive art and accessible topic controls |
| `src/lib/cinematic.mjs` | Topics, presentation toggles, event-driven parallax and lifecycle |
| `src/styles/cinematic.css` | Shared artwork, controls and motion |
| `src/styles/page-experience.css` | Public page composition and mobile 3D/art layout |
| `src/styles/cinematic-investor.css` | Investor opening/login composition |
| `src/lib/menu-preview.mjs` | Preview changes without changing current-page semantics |
| `src/styles/menu-preview.css` | Menu body composition; does not change header geometry |
| `src/lib/loader.ts` | Click-only entrance, keyboard link and transition completion |
| `public/assets/cinematic/` | Optimized, clean image assets |

The three image-generation briefs were: two gunmetal server chassis with four
visible GPU modules; a rural campus concept with three modest buildings and two
translucent proposed factory volumes; and battery/transformer/solar equipment.
All used forest-black, signal green and warm material lighting, without baked-in
UI, text, or logos. The existing SVG logo is used by the actual interface.

## Verification and limits

72 automated tests pass, including manual entry, reduced motion, preview loading,
keyboard focus, pause/restoration, public 3D and the existing investor finance/auth
suite. 154 generated-page checks and 31 compiled-server investor HTTP checks pass.
Targeted TypeScript checks and Node/Vercel builds pass. The HTTP tests use a local
session-service fixture. The exact header artwork and geometry have no diff.

Automatic browser permission review previously rejected local preview access.
No fresh browser screenshots or real-device frame-rate measurements were taken.
Deployment status and live HTTP source/asset checks are recorded separately at
publication; these do not substitute for visual inspection on a visitor's device.

Useful post-release review: check the menu with mouse and keyboard; resize a page
to a phone width; enlarge text; open/close 3D; try the initial Enter link; verify
investor access and the calculator using the configured account. No production
customer inquiry or investor transaction was submitted as part of testing.
