# Approved campus imagery at every entry point

Review date: 13 September 2026.

The `/site` Explore in 3D control previously mounted the older procedural model. The homepage's final Walk the campus chapter used the same model. Both now lead into the approved Blender campus experience at `/site/campus`.

## Result

- `/site`, `/about` and `/contact` show the approved arrival render and a normal, keyboard-accessible link to the full campus viewer. These entry panels do not initialize WebGL.
- The homepage campus chapter offers Arrival, Aerial, Data hall and Manufacturing views. Each image loads when selected; the first view reuses the intro's arrival image.
- The intro, menu and shared campus artwork use the same approved source. Disclosures identify the images as proposed design studies, rather than photographs or installed facilities.
- The detailed campus viewer, its model and its rendering/recovery controls remain on `/site/campus`.

## Loading and interaction

The arrival WebP is 245,748 bytes. All four 1600-pixel gallery files total 599,048 bytes, but the additional views are requested only when selected. Homepage and content-page browsing request no campus GLB, HDR environment, mesh decoder or full-viewer code.

The homepage uses an empty static scene behind the DOM gallery. Its engine retains navigation callbacks but stops GPU drawing after the transition settles. Image movement ends after 4.5 seconds; reduced motion disables movement and fades. Selection has a bounded load timeout and ignores superseded requests. A failed image leaves navigation and another selection available.

The gallery hides when scrolled into the services below, restores on return and preserves the selected view during Back navigation. The observer's viewport boundary matches the fixed-header cutoff. Services sit below the shared fixed header so the menu stays clickable.

## Verification

- TypeScript check and 232 unit/static tests passed.
- Node and Vercel builds passed. Both outputs passed 158 generated-page checks across eight routes and 505 general QA checks across ten public pages and 158 internal links/downloads.
- 116 compiled-server HTTP checks passed, including private-route access protections. These use a local TLS Redis fixture.
- Five production-build Chrome browser groups passed. They cover all three campus content entries, all four homepage images, keyboard selection, failed and superseded image loads, native scrolling, chapter changes, reduced motion, touch scrolling, slow return from services and actual browser Back/Forward cache restoration.
- Instrumented WebGL recorded zero idle homepage draws while navigation callbacks continued. Network observation confirmed no full campus assets loaded through these entry points.
- Desktop and mobile screenshots reviewed for imagery, text contrast, control placement, matching menu disclosures and links to the full viewer. Additional 1366×768 and 390×667 checks found no overlap or horizontal overflow.

Re-run the focused browser coverage against a served production build:

```sh
node tools/test-campus-entry-browser.mjs http://127.0.0.1:4342
```

Set `QA_BROWSER=msedge` to exercise installed Edge, or `CHROME_PATH` to use a specific Chromium executable. The suite requires no credentials and does not send forms.

This update changes campus entry visuals and navigation. The financial model, proposed equipment status, detailed campus geometry and investor access rules are unchanged.
