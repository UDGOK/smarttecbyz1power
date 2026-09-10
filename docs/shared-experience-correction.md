# One SmartTec experience — shared header

For the current cinematic page treatment and manual entrance, see
[`cinematic-release.md`](cinematic-release.md). The original header correction below
records the shared structure that remains in place.

The prior update shared fonts and assets but retained three different header
designs. The owner correctly identified that the homepage, public service pages
and investor room still felt disconnected. This update changes the actual
components and page composition.

## What is now shared

Every route uses `src/components/SiteHeader.astro`, including the homepage,
eight public pages, brand gallery, investor login and authenticated investor room.

| Element | One implementation |
| --- | --- |
| Logo | Homepage's approved SmartTec symbol, 25 × 26 artwork in a 38px box |
| Position | Fixed 16px corner inset; no separate sticky bar or investor logo card |
| Hamburger | Same bars-first Menu button, typography, shape and position |
| Center marker | Same floating location; homepage stage ruler or contextual chapter ticks |
| Right chip | Same dimensions and alignment; planned-load counter on home, relevant access/action elsewhere |
| Open menu | Same full-screen site index, with contextual home/investor chapters |
| Mobile | Same corner arrangement; center ticks hide before they collide with controls |

The investor header no longer uses a separate Explore button or boxed wordmark.
Its Returns link lives in the same right-hand chip position. The full brand lockup
remains appropriate in footers. The old `SiteNav.astro` is only a compatibility
wrapper around the shared component.

The service pages now place centered display text over a wide 3D scene, using the
homepage's composition. The earlier split layout and rounded scene box are removed
from Site, Power, Compute, Colocation and About openings. Contact, News and the
planner keep compact working introductions with optional scenes, beneath the same
header. The investor opening and login use the same centered type and spacing.

## Interaction details

- The same native dialog handles global navigation everywhere. It contains its
  own matching close button, supports Escape and returns focus correctly.
- The menu can scroll on a phone without advancing the homepage's cinematic
  scene. It does not apply a persistent body scroll lock.
- Homepage stage jumps remain inside the existing stage root. Investor chapter
  tracking, map, calculator, questions and logout continue to use their existing
  data and APIs.
- Scene controls expand over the view. Closing them releases campus drag so the
  page scrolls normally. Closing 3D restores the headline and clears the panel.
- Public scenes pause while the menu covers them. Existing on-demand loading,
  reduced-motion behavior, rendering limits and cleanup remain in place.
- Concept labels stay visible. The 3D geometry does not establish installed
  equipment, surveyed positions or operational capacity.

## Files your designer should use

| File | Purpose |
| --- | --- |
| `src/components/SiteHeader.astro` | The only header composition |
| `src/styles/site-header.css` | Shared header geometry, mobile rules and menu overrides |
| `src/components/chrome/Brandmark.astro` | Approved homepage symbol |
| `src/components/chrome/SiteMenu.astro` | Shared navigation and contextual chapters |
| `src/lib/menu.ts` | One menu lifecycle, focus and gesture handling |
| `src/layouts/Content.astro` | Shared public-page integration |
| `src/components/PageScene.astro` | Wide scene and expandable controls |
| `src/styles/page-experience.css` | Public opening composition and reading layout |
| `src/smarttec-investor/components/Journey.astro` | Investor header integration and chapter dock |
| `src/smarttec-investor/client/journey.mjs` | Chapter tracking only; menu belongs to shared controller |
| `src/smarttec-investor/styles/journey.css` | Investor body, entrance and chapter styling |

Do not recreate the header in an individual page. Edit the shared component/style
and check the homepage, a public page and both investor states together. Do not
move the homepage header outside `main[data-stage-root]` without updating the
homepage stage controls. Do not place the dialog inside a filtered header wrapper.

The private script policy remains `script-src 'self'`. `astro.config.mjs` keeps the
shared menu and investor chapter controllers external. Keep the Journey processed
script before its `noscript` fallback: the compiler otherwise emitted it literally
in this version, which the private script policy correctly blocked. The compiled
HTTP checks guard this behavior. Do not relax the script policy to fix navigation.

## Review and validation

Three independent source reviewers examined experience/navigation, visual styles
and integration/privacy. Their findings drove the shared header, hamburger-position
fix, root font-scale alignment, narrow-screen badge correction, menu gesture guard,
scene close/drag reset and inset keyboard-focus outline.

Automated validation covers:

- 65 tests, including shared-menu initialization, Escape/cancel, focus return,
  chapter navigation, browser restoration and scene controls.
- 118 generated public-page checks, including identical logo and menu markup
  against the homepage and the wide-scene opening configuration.
- 31 compiled-server investor HTTP checks, including identical login/private
  header markup, external scripts, authentication, protected assets and logout.
- Targeted TypeScript checking and Node/Vercel builds.

The full repository type-check retains its existing missing Node type declaration
in `astro.config.mjs`. This update changes no dependencies or lockfile. The separate
untested performance investigation branch is excluded.

These are source, state and generated-output checks. The earlier browser permission
review denied local preview access; no rendered desktop/mobile inspection is claimed.

## Vercel preview checklist before merging

1. Compare `/`, `/site`, `/compute`, `/contact`, `/brand`, `/investors/login` and
   authenticated `/investors` at 1440px, 768px and 320–390px widths. The logo,
   hamburger and right-chip positions must match. Header controls must not collide.
2. Open Menu on each route. Check the same site index, readable rows, touch scroll,
   visible cursor, close button, Escape and focus return. Test Back/Forward.
3. On the homepage, use stage jumps from the menu and center ruler. Check the
   loading/entry screen and the light campus stage's header contrast.
4. On public scene pages, open Scene controls, enable drag, collapse controls,
   scroll the page, reopen and Close 3D. The headline must return. Repeat on a phone
   and with reduced motion enabled; check keyboard focus inside the canvas.
5. Confirm the investor room retains global site links and its chapter links.
   Change calculator inputs, check the FAQ and map, then sign out. Public visitors
   must still be redirected to login and must not receive private assets.
6. Check long headlines, enlarged text and print layout. Look for clipped text,
   hidden headings, console errors or continuous rendering behind the menu.

No new packages, API keys or environment variables are needed. Existing investor
settings still apply. Publisher 1.4 updates the same review branch and PR #3; it
does not merge or explicitly deploy. Vercel may run configured builds after push.
