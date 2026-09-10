# SmartTec public page experience

Updated by **Publisher 1.4**. Read `docs/shared-experience-correction.md` first for
the shared homepage header and current navigation/scene controls.

The public service pages now extend the homepage's visual language: approved
SmartTec logo, shared typefaces, forest and signal-green colors, spatial scenes,
and a linked chapter sequence. The implementation is already integrated into the
existing Astro project. Keep the current stack and deployment configuration.

## Page mapping

| Page | Interactive scene | Opening behavior |
| --- | --- | --- |
| `/site` | Homepage campus concept | Desktop opens on visibility; phone opens on request |
| `/power` | Homepage solar/storage concept | Desktop opens on visibility; phone opens on request |
| `/colocation` | Homepage compute hall | Desktop opens on visibility; phone opens on request |
| `/compute` | Homepage compute hall | Desktop opens on visibility; phone opens on request |
| `/about` | Homepage campus concept | Desktop opens on visibility; phone opens on request |
| `/model-planner` | Compute hall | Collapsed optional panel; planner remains accessible |
| `/news` | Energy concept | Collapsed optional panel; articles remain accessible |
| `/contact` | Campus concept | Collapsed optional panel; inquiry form remains accessible |

The homepage retains its existing experience. The brand-kit page keeps its asset
gallery and inherits the shared navigation/footer. Investor login and private
assets retain their existing protection. These public scenes use the procedural
geometry already used on the public homepage; no private survey, image or model
was copied into public assets.

## Experience and controls

- Service-page openings place centered type over a wide spatial scene, following
  the homepage composition. Working pages use a compact introduction.
- A direct link takes visitors to the page's primary content. The bottom chapter
  links lead naturally to the next service. The existing full-screen site menu
  remains available.
- Campus controls provide named viewpoints, rotate, zoom and reset. Drag is
  explicitly enabled and can be turned off; normal scrolling remains available
  by default. Keyboard arrow/zoom keys and labeled buttons provide alternatives.
- Energy and compute scenes use a labeled position slider. Motion is paused by
  default; Play/Pause is optional. Every scene has Close and Retry controls.
- Reduced-motion, data-saver and touch-device visitors opt in. Reduced-motion
  hides the animation control. Without JavaScript or WebGL the text, links and
  primary tools remain available.

## Performance design

The initial scene controller is small. It dynamically imports the renderer,
Three.js and the one selected scene. It does not start the homepage's entry gate,
sound, scene stack or full-screen postprocessing.

The drawing buffer is capped at one million pixels and device pixel ratio is
capped at 1.25, or 1 on touch devices. Shadows are disabled. Animation is capped
at 30 fps when explicitly playing. Static views stop requesting frames after a
short interaction settling period. Offscreen and hidden-tab scenes pause;
closing the view or leaving the page releases its renderer. These are code
limits, not measurements of real-device frame rate.

The separate performance investigation draft is not part of this update.

## Files to maintain

| File | Responsibility |
| --- | --- |
| `src/data/page-experiences.ts` | Route order, scene selection, titles and concept labels |
| `src/components/PageScene.astro` | Accessible scene window and controls |
| `src/components/PageTrail.astro` | Previous/next chapter links |
| `src/lib/public-scene/controller.mjs` | Loading, fallback, controls and navigation lifecycle |
| `src/lib/public-scene/renderer.ts` | One scene, rendering budget and cleanup |
| `src/styles/page-experience.css` | Responsive public-page styling |
| `src/layouts/Content.astro` | Shared integration and direct content links |
| `src/components/SiteHeader.astro` | Shared homepage-based header and current chapter |
| `src/components/SiteFooter.astro` | Approved logo lockup |

Keep the scene captions. They explain that these views are illustrations, not a
survey or an operating facility. Compute and Colocation also remove contradictory
claims about installed liquid cooling, fit-out readiness and immediate hardware
availability. This styling update is not a full verification of every existing
commercial or facility statement on the site.

## Completed verification

- 65 automated tests covering navigation and scene lifecycle/interaction.
- 118 generated HTML/dependency checks across all eight routes: headings, links, logo/fonts,
  scene configuration, optional working-page panels and public/private separation.
- The public controller's static dependency path excludes the 3D renderer/scenes.
- Targeted TypeScript checking for the new renderer/configuration.
- Node and Vercel builds; 31 compiled-server investor HTTP checks with a local
  session-service fixture. These HTTP checks do not contact live Upstash/Vercel.

The repository-wide `tsc --noEmit` command encounters an existing missing Node
type declaration for `process` in `astro.config.mjs`. Targeted checking passes;
no dependency or lockfile changes were made for this update.

## Required Vercel preview review

Browser permission review denied local preview access. Desktop/mobile visual QA
and actual WebGL smoothness are still pending; automated tests cannot substitute
for them. Before merging PR #3:

1. Open each route above at desktop and phone widths. Confirm the logo, readable
   headings, menu, page links and absence of horizontal overflow.
2. On desktop, open the campus, energy and compute views. Try every viewpoint,
   slider, zoom, drag, reset, Play/Pause and Close control. Repeat after Back/Forward.
3. On a phone, confirm the page opens immediately and 3D waits for a tap. Scroll
   over the canvas before and after enabling drag. Turn drag off to restore scroll.
4. Enable reduced motion. Confirm no autonomous motion starts and all content is
   usable. Simulate a failed scene request and check the reading view and Retry.
5. Open the model planner, change a model/input and confirm it recalculates. Check
   Contact validation without submitting a real inquiry. Check the news links.
6. Confirm `/investors` still redirects signed-out visitors to login. Review the
   existing investor journey in the same preview using your configured credential.
7. Check the browser console and network panel. In a closed optional scene panel,
   Three.js should not load through that panel. Verify GPU animation pauses when
   offscreen and that repeated open/close cycles do not accumulate contexts.

No additional environment variables, API keys, packages or asset downloads are
required for these public-page scenes. Existing investor environment settings
still apply. The publishing helper updates the review branch and PR; merging and
production release remain a separate decision after preview review.
