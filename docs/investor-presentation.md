# Investor presentation, 11 September 2026

The 26-page landscape PDF uses the site's Space Grotesk and Google Sans Code fonts, original vector logo paths, forest/signal/off-white palette and Runway-generated product, energy, fiber and campus concept imagery. The competitor deck informed topic coverage only. No competitor financial statements, biographies, pipeline, valuation multiples or claims were reused as SmartTec facts.

The presentation describes the proposed 64-B300 deployment (60 saleable GPUs and four financial reserves), management-reported founder funding and overage intent, commercial pipeline, site rights, behind-the-meter power, new cooling, partial initial funding, illustrative GPU rental revenue, historical model context, delivery milestones, team, potential investment structure, risks and sources.

The PDF and 13-chapter immersive version address prospective investors. They state SmartTec's proposal, current status and terms for discussion; internal interview questions and instructions to the founder belong in working diligence records. Proposed governance and procurement gates must remain explicitly proposed. Zero signed customer contracts, uncontracted revenue, unverified supply terms, incomplete funding and unestablished updated returns remain visible. The earlier return model is labeled historical, not presented as a current forecast.

## Build and publication

- Canonical artifact: `output/pdf/SmartTec-Investor-Presentation-2026-09.pdf`. The undated PDF is the prior edition; the authenticated download uses the dated edition recorded in `investor-deck.json`.
- Rebuild with `python tools/build-investor-deck.py` using Python with ReportLab and Pillow, plus Node on PATH. The builder calls `tools/export-investor-deck-data.mjs` to export current readiness inputs and calculate the explicitly historical comparison.
- The builder also emits server-only PDF bytes and `data/investor-deck.json` metadata. Normal site builds use these committed outputs and do not require Python.
- Current figures pull from the readiness record; the historical comparison pulls from the ROI engine. Narrative quotes, dates and selected assumptions require editorial review when inputs change. Tests fingerprint the source study and engine so a changed economic model cannot silently leave the PDF stale.
- The investor header and presentation section link to `/api/investor/presentation`. GET and HEAD require the existing investor session. Responses use private no-store headers and an attachment filename. The PDF is not a public static site asset.
- Website login protects the website download route. It does not make files in the GitHub repository confidential.

## Validation

Reproduce PDF validation with `python tools/verify-investor-pdf.py` after rebuilding. All 26 pages are rendered with Poppler and visually inspected after layout corrections. Text bounds, contacts, all supplied leadership names, relevant hardware/funding figures, source links and PDF structure were checked. The 1.6 MB PDF stays below the deployment response budget.

Automated checks include the unit suite, the PDF verifier and compiled-server HTTP tests for signed-out rejection, authenticated download hash/size/type, HEAD and post-logout rejection. Public-page and link checks also passed. No messages were sent to investors and no financial terms were accepted.

## Runway and review revision

Three original Runway images illustrate power-to-compute, solar/storage/gas supply and compute infrastructure. Optimized WebP files under `public/assets/investor/` also appear on the investor page with fixed dimensions, lazy loading and concept captions. Prompts and task identifiers are recorded in `docs/runway-investor-artwork.json`; temporary signed provider URLs are not published.

Three simulated investor perspectives informed the decision brief, customer offer, GPU allocation chart, capital-recovery timeline and proposed responsibilities. Their questions, evidence-based answers and diligence-only conclusions are in `docs/investor-review-panel.md`. Neither the images nor the reviews establish physical completion, customer commitments or investment readiness. Financial model inputs were unchanged.

Desktop (1440 px) and mobile (390 px) screenshots were inspected through a local automated authenticated fixture. All images decoded and neither viewport overflowed horizontally. Optional reproduction: set `INVESTOR_VISUAL_QA=1` and, when needed, `INVESTOR_QA_BROWSER=chrome` before the compiled-server HTTP test. This uses test credentials, not a live investor login.

## Institutional visual edition

The 26-page edition now uses native forest-to-emerald and pale-sage PDF gradients, subtle alternating table bands, full-bleed photographic concept backgrounds, a branded B300 cover and a matching image-led website section. Three additional images were generated through the connected Runway account. The product composition uses NVIDIA's DGX B300 enclosure image and the SmartTec logo as references; it remains a generated concept rather than an exact product photograph or evidence of installed hardware. The exact original vector logo remains in the PDF header.

Visual reference: https://docs.nvidia.com/dgx/dgxb300-user-guide/introduction-to-dgxb300.html . Runway prompts, task identifiers and reference-image URLs are preserved in the artwork provenance file. Source images are optimized for delivery without changing the financial model. All 26 pages and local desktop/mobile website screenshots are checked again for this edition.
