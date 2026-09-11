# Protected investor presentation media

The immersive pitch uses same-origin, authenticated media endpoints. Source binaries live in `src/smarttec-investor/media/pitch/`; they must never be copied to `public/` or imported into a client script.

| Source | Protected API action |
| --- | --- |
| `fiber.mp4` | `pitch-fiber-video` |
| `compute.mp4` | `pitch-compute-video` |
| `campus.mp4` | `pitch-campus-video` |
| `fiber-poster.webp` | `pitch-fiber-poster` |
| `compute-poster.webp` | `pitch-compute-poster` |
| `campus-poster.webp` | `pitch-campus-poster` |
| `vision.webp` | `pitch-vision-image` |

Each action is served at `/api/investor/{action}`. Generated visuals are concepts; they do not establish installed equipment, approved engineering or current site photography.

## Build and verification

`node tools/build-pitch-media.mjs` validates all seven source files and generates the server-only `server/pitch-media.mjs` registry plus `data/pitch-media.json`. The normal staging step runs this generator before a build. Missing files, invalid file signatures or individual assets larger than 2,000,000 bytes stop the build. Each request returns at most one of these bounded assets.

Run `node tools/build-pitch-media.mjs --check` to verify the registry and manifest against the source bytes. Run `node --test tests/pitch-media.test.mjs` for authentication, metadata, seeking, integrity and response-size checks. The test suite rejects an empty registry.

## Delivery behavior

`handlers.mjs` authenticates before calling `pitch-media-response.mjs`. Anonymous and expired sessions receive 401; authenticated media routes allow GET and HEAD only. No public URLs or storage credentials are returned. Responses retain the private cache and security headers, with `Cross-Origin-Resource-Policy: same-origin` and no permissive CORS header.

GET supports a single byte range, including suffix and open-ended ranges. Valid selections return 206 with exact `Content-Range` and `Content-Length`; malformed, unsupported multipart or unsatisfiable byte ranges return 416. HEAD returns full metadata without a body and ignores Range. Unknown range units and mismatched If-Range validators return the full representation. These HEAD and validator rules follow [RFC 9110, section 14.2](https://www.rfc-editor.org/rfc/rfc9110.html#section-14.2).

The private CSP's `default-src 'self'` already permits same-origin video. Only `/investors/pitch` allows same-origin framing (`SAMEORIGIN` and `frame-ancestors 'self'`) so the authenticated investor room can open it in a full-window modal. Other private pages keep their existing frame denial. Script and remote-origin restrictions remain in place. This is authenticated access control, not DRM; an authorized viewer can retain bytes already received.

## Presentation controls

The investor-room link requests native fullscreen directly from the viewer's click, with a full-window presentation when the browser declines. The iframe is created lazily and unloaded on Close. The standalone route remains a normal link destination.

The 13 chapters advance after 18–24 seconds of reading time. The clock waits while text remains below the current view, the chapter list is open, or the tab is hidden. Arrows, chapter selection and horizontal swipes also navigate. Vertical scrolling reads longer chapters. Completing the final chapter does not loop automatically; Play replays from the beginning.

Sound starts off. Selecting Sound starts an original adaptive score: warm synth chords, gentle data pulses and filtered air, with a distinct arrangement for each of the 13 chapters. The default listening level is 55%; the Volume control adjusts it from silent to full and remembers only volume for this browser session. Pausing slides leaves the music playing so viewers can read. Hidden tabs and the chapter drawer suspend sound; Close releases its audio context. Reduced-motion and data-saving preferences start with still images and manual navigation; Play slides explicitly loads film, while Sound can be enabled independently.

`node tools/render-pitch-score.mjs` renders and measures all chapter arrangements, rapid chapter changes, mute/volume controls and a medley using Chrome's OfflineAudioContext. WAV previews and measurements are written to `tmp/pitch-audio/`. The score uses a fixed graph, smooth gain ramps and a bounded output stage; production generates the music locally without an audio download. The authenticated browser checks also measure the final audio waveform and exercise the listening controls.

Financial content comes from `investment-readiness.mjs`, matching the current investor page and downloadable PDF. Concepts do not establish customer commitments, installed infrastructure or an investment return.

The optional real-browser regression runs against local authenticated fixtures, without production credentials:

```sh
INVESTOR_VISUAL_QA=1 INVESTOR_QA_BROWSER=chrome node tools/test-investor-http.mjs
```

It covers all 13 chapters at desktop and mobile widths, actual H.264 decoding, optional audio, fullscreen fallback, focus, pause, frame cleanup and reduced-motion behavior. HTTP checks always run, including authentication, cache controls, byte ranges, expiry and PDF integrity.
