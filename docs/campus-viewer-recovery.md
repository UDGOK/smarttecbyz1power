# Campus viewer recovery and performance fix

13 September 2026

## Confirmed defects

Selecting High while the first model load was pending could create a composer tied to that attempt's canvas. If loading then failed, Retry created a second renderer but retained the first composer. Camera changes rendered into the detached canvas without an uncaught browser error. This was reproduced against the previous production release.

WebGL context loss permanently disabled 3D and instructed the visitor to reload. Loading and optional shader setup also lacked complete cancellation and timeout handling. A thrown frame-render exception had no recovery boundary.

## Changes

- Initialization has one owner/generation; late assets and optional-quality imports cannot attach to a replacement renderer.
- Failed initialization, context loss and rendering exceptions share a complete resource disposal/reset path. The still remains available, with an enabled **Restart 3D** action that creates a fresh renderer on the same page.
- Successful model bytes remain cached in memory for graphics recovery, avoiding another model download. Failed loads release cached bytes so a retry can fetch again.
- Asset/body timeouts and cancellation include HDR, geometry, decompression, routing and optional-quality setup. Model-ready reuse cannot bypass a pending initialization.
- Shader prewarming uses cancellable readiness polling. Three 0.180's stock `compileAsync` timer is deliberately avoided because it can continue reading disposed material records after cancellation.
- Partial optional-quality construction is disposed and falls back to Balanced.
- Twenty-six authored point lights are represented by four stable runtime light slots selected near the camera and its target. Still renders retain the original lighting.
- Live architectural glazing uses ordinary reflected/translucent PBR; equipment displays remain opaque. This removes the extra full-scene transmission render pass.
- Shadow and pixel budgets are capped, and trace-only rendering runs at up to 30 fps. Idle, offscreen and reduced-motion behavior remains supported.

## Verification

- 232 unit/static tests pass, including 15 cancellation/timeout/polling tests.
- Six production-preview browser groups pass: all views/assets; materials and lifecycle; High/failure/retry; rapid controls; injected render exception/restart; and mobile/reduced motion.
- Recovery assertions require new draw calls on the current visible canvas, not merely the absence of browser errors or hidden initialization work.
- Chrome and stable Edge visual/performance reviews pass for the data hall and manufacturing interiors.
- Measured All-system trace draw calls fell from 2,425 to 1,433 in Balanced, and from 3,424 to 2,432 in High. These structural reductions are repeatable; timing comparisons were affected by cache state and concurrent tests and are not presented as a universal speed guarantee.
- Both production adapter builds, TypeScript, 158 public-page checks, 505 link/content QA checks and 116 compiled investor HTTP checks pass.

No public model geometry, rendered images, financial data, investor PDF or project assumptions change in this release. Actual performance still depends on the browser and graphics hardware; initial High-quality effects can briefly pause while compiling.
