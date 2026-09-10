> Header and menu implementation updated by Publisher 1.4. Follow
> `docs/shared-experience-correction.md` for current navigation; older header
> descriptions below are historical. Investor capabilities remain applicable.

# SmartTec investor experience update

Prepared 10 September 2026 for the existing Astro/Vercel website.
Branch: `codex/investor-visual-upgrade`. Continue the existing draft PR #3.

## What investors will experience

- The approved architectural SmartTec by Z1Power lockup at the private entrance, floating header, chapter menu and footer.
- A full-height opening scene with the existing, protected manufacturing concept image, clearly identified as an AI concept.
- A floating header, chapter ruler and full-screen seven-chapter index using the homepage's forest, signal-green, typography and motion tokens.
- A compact Back/Next control that follows the reading position, including inside the long calculator. The desktop header also links directly to Returns.
- A mobile Explore menu and chapter controls. The prior investor header hid its navigation below 900px.
- Native scrolling for reading, forms and touch interaction. The existing campus imagery, optional 3D models, survey, calculator and FAQ remain available.

The real approved logo is already in `public/assets/brand/`. Do not recreate it
as typed text, stretch it, or substitute an old brand-kit experiment. Its
approval record is `SmartTec-Brand-Kit/source/design-notes.md`.

## Integration

The changes are integrated into the existing routes. Applying the branch and
building the project is sufficient; no copied snippets or extra page builder
is needed. The Astro version and dependencies remain as they were.

| Area | File | Responsibility |
|---|---|---|
| Shared logo | `src/components/BrandLockup.astro` | Approved SVG with a separate black print version |
| Shared font loading | `src/components/SiteFonts.astro` | Existing Space Grotesk, local Google Sans Code and optional licensed faces |
| Shared identity | `src/styles/tokens.css` | Homepage colors, type families, weights, radii and easing; imported unchanged |
| Investor chrome | `src/smarttec-investor/components/Journey.astro` | Header, chapter index, ruler and dock |
| Reading order | `src/smarttec-investor/data/journey.mjs` | One ordered list for all chapter controls |
| Navigation behavior | `src/smarttec-investor/client/journey.mjs` | Current section, native modal and browser restore state |
| Investor appearance | `src/smarttec-investor/styles/journey.css` | Responsive layout, motion and print rules |
| Routes | `src/pages/investors/index.astro`, `login.astro` | Integrated page and private entrance |
| Script delivery | `astro.config.mjs` | External `investor-journey` chunk required by the existing CSP |

Retain these section IDs: `opportunity`, `campus`, `deployment`, `capital`,
`returns`, `evidence`, `questions`. Survey reference remains `site-map`.
Retain the calculator's input/result IDs and the single `inv-logout` control.

## Fonts and security

Both public and investor layouts use the shared font component. Current
display/body text uses Space Grotesk, with Google Sans Code for small labels.
Ratch and PP Supply remain first in the shared font stacks and load only if
the licensed files are actually present. No license purchase is assumed.

The investor room serves all fonts from the same origin. Google Sans Code's
unchanged font files and SIL Open Font License are in `public/assets/fonts/`.
The existing Space Grotesk license remains in `public/investor-assets/`.
The homepage retains its existing editorial font families.

Do not remove the explicit `investor-login` or `investor-journey` chunks from
the Vite configuration: Astro can otherwise inline small scripts, which the
private page's `script-src 'self'` policy blocks. Do not weaken that policy.
There are no new passwords, authentication bypasses, environment variables or
map keys in this update. Use the deployment's existing private-access setup.

## Verification completed

- 48 Node tests, including financial units, cash timing, authentication,
  protected assets, campus state and the new chapter controller.
- 31 compiled Node HTTP checks with a local TLS Redis fixture. These cover
  private access, login/logout, protected imagery/models, calculation, the
  integrated chapter markup, required logo/fonts and external script delivery.
- Full builds for Node and Vercel.

The local fixture is not the project's live Vercel/Upstash infrastructure.
The navigation state test is not a browser or native dialog implementation.

## Visual review required before merging

The browser permission review denied local preview access in this session.
Consequently, desktop/mobile layout, native focus behavior and GPU performance
are pending review on the actual Vercel preview; they are not represented as
verified or "triple checked."

1. Open the PR's actual Vercel preview and sign in through the existing private entrance. Confirm successful login and that anonymous investor/API requests remain denied.
2. At desktop widths, compare the logo, text and floating controls with the homepage. At 320px, 390px and 768px, check that the logo, Explore button and dock fit without horizontal page overflow. Test landscape and 200% zoom.
3. Open Explore with mouse, touch and keyboard. Tab should stay inside the native dialog; Escape and Close should return focus to Explore. A chapter link should close the menu and move to that chapter. The selected ruler and dock should follow.
4. Load the labeled calculator illustration, acknowledge its basis, calculate, edit a field, add equipment and export a scenario. Confirm the dock stays on Returns throughout the long form and never hides the focused input or result. A positive or negative result must retain its conditional basis.
5. Switch every campus image and 3D model, rotate/zoom/reset, open the survey reference and return with browser Back/Forward. Confirm controls and labels recover, and that graphics failures retain the image fallback.
6. Enable reduced motion; navigation should jump without smooth movement and the menu should appear without animation. Print a calculated summary; floating chrome should be absent and the approved logo should print in black.
7. Check the console for CSP errors, missing fonts/assets and runtime exceptions. Confirm the four known concept scenes load only through authenticated endpoints.

The existing model remains a simplified spatial study. This update does not
create a new photorealistic orbitable campus twin. Engineering status,
property value disclosures and conditional financial assumptions remain part
of the investor presentation.
