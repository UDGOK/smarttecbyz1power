# QA correction — 10 September 2026

The public site was reviewed at desktop and phone widths. Private investor pages were reviewed through source, calculator tests and a compiled-server HTTP suite using an isolated Redis fixture; no live private sign-in was used.

## Corrections

- Shared hero layout now uses the intended full text column. At a 1440px viewport, the five affected page headings measure about 619px wide, up from about 267px.
- Refreshed news entries use the same global, namespaced styles as initial entries.
- The mobile menu has a stable accessible name and retains keyboard focus behavior.
- Public draft markers and photography briefs have been replaced with customer-facing status wording. Pending engineering, carrier, entity and commercial facts remain qualified; the original diligence register is in `qa-open-items.md`.
- Inquiry CTAs request a conversation; they do not imply a capacity reservation. Connectivity, generation and building labels are consistent with the project record.
- The advertised sitemap exists and excludes private investor routes and the brand utility page.
- Brand folder references expand into real downloadable files.
- Planner empty searches and invalid numeric inputs clear stale results and explain how to recover. IT power includes the host allowance; complete rack GPU power is shown separately.
- Investor calculations capture the submitted scenario and ignore obsolete responses after edits or a newer calculation. Displayed results and exports retain the same assumptions.
- Windows-compatible staging/build commands, declared test dependencies, a Node 24 deployment runtime, patched Astro/adapters and a compatible routing dependency override restore reproducible checks. The npm audit reported zero vulnerabilities after the update.

## Inquiry delivery

Both forms default to FormSubmit and the owner-provided recipient `yasir@futonix.com`. The contact page also has a direct `mailto:` link. JavaScript submissions require an explicit `success` acknowledgment, preserve fields on failure, time out after 12 seconds, and prevent edits while sending. Native form submission has a real service action when JavaScript is unavailable.

FormSubmit requires a one-time activation by the recipient. After deployment, submit a clearly marked test from `/contact`, then confirm the FormSubmit activation email in the recipient inbox. Submit again and verify receipt. An HTTP acknowledgment verifies service acceptance, not inbox arrival; activation and actual inbox receipt must be confirmed by the owner. Do not describe the form as fully verified until that step is complete.

The owner subsequently confirmed activation and receipt of the post-activation QA inquiry at `yasir@futonix.com` on 10 September 2026. End-to-end delivery was verified for that test.

An optional `PUBLIC_RESERVE_ENDPOINT` can replace the AJAX endpoint. It must accept JSON and return `{ "success": true }` only after accepting delivery. Change `FORM_ACTION` too when replacing the native form provider. Provider documentation: https://formsubmit.co/documentation.

## Repeatable checks

Use Node 24 and `npm ci`.

```sh
npm run check
npm test
npm run build:node
npm run verify:pages
npm run verify:qa
node tools/test-investor-http.mjs
npm run build
npm run verify:pages -- .vercel/output/static
npm run verify:qa -- .vercel/output/static
```

The HTTP test needs OpenSSL on PATH (included with Git for Windows). GitHub Actions runs these checks using Node 24. Public generated checks cover all ten public pages and 157 distinct internal page/download links. The regression suite covers stale calculator responses, planner validation/recovery and delivery acknowledgment/error handling.

Interactive QA additionally checked public pages at 1440px and 390px, menu opening/closing, planner search and invalid input, and news row styling. This does not establish physical-device/Safari compatibility, sustained-load capacity, or real private account behavior.

## Brand studio follow-up

The brand page now displays all 90 browser-viewable assets in a responsive gallery, with combined search/category/format filters and an accessible full-screen viewer. All 146 originals remain downloadable through the searchable file index and complete ZIP. The logo selector pairs each of twelve mark/colour combinations with the matching SVG, PNG and EPS; embroidery previews link to their corresponding PES drafts and retain the test sew-out qualification.

Motion starts only on explicit playback. Closing the viewer releases its media and restores keyboard focus; native downloads remain usable without JavaScript. Colour copying reports success or a manual-copy fallback. Existing artwork is reused without modifying the design files.

Validation: 88 automated tests, 154 generated-page checks and 402 QA checks pass. Node and Vercel builds pass. Desktop and 390px browser review covered the logo selector, combined filters, full-height portrait previews, keyboard dismissal, focus return, and actual motion playback. Every visual, poster, matching logo download and related stitch file is checked against the original kit.
