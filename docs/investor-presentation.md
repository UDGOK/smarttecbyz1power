# Investor presentation, 11 September 2026

The 26-page landscape PDF uses the site's Space Grotesk and Google Sans Code fonts, original vector logo paths, forest/signal/off-white palette and Runway-generated product, energy, fiber and campus concept imagery. The competitor deck informed topic coverage only. No competitor financial statements, biographies, pipeline, valuation multiples or claims were reused as SmartTec facts.

The presentation covers the opportunity, market context, campus, power, engineering readiness, products, customer strategy, the conditional 60+4 B300 deployment, monthly cash generation, funding, five-year financial schedule, fleet alternatives, required price/capex, downside sensitivities, milestones, the owner-supplied team, proposed governance, expansion, diligence, assumptions, sources and contact.

The latest IEA 2026 executive summary supplies the global market chart: 485 TWh in 2025 and a 950 TWh projection for 2030. It does not establish local customer demand. Owner-reported power terms, capacity gaps, unverified demand and unquoted costs remain explicit. Financial projections are pre-tax project sensitivities and are not audited company statements or agreed investor terms.

## Build and publication

- Canonical artifact: `output/pdf/SmartTec-Investor-Presentation.pdf`.
- Rebuild with `python tools/build-investor-deck.py` using Python with ReportLab and Pillow, plus Node on PATH. The builder calls `tools/export-investor-deck-data.mjs` to recalculate the financial schedule.
- The builder also emits server-only PDF bytes and `data/investor-deck.json` metadata. Normal site builds use these committed outputs and do not require Python.
- Financial tables pull from the ROI engine. Narrative quotes, dates and selected assumptions require editorial review when inputs change. Tests fingerprint the source study and engine so a changed economic model cannot silently leave the PDF stale.
- The investor header and presentation section link to `/api/investor/presentation`. GET and HEAD require the existing investor session. Responses use private no-store headers and an attachment filename. The PDF is not a public static site asset.
- Website login protects the website download route. It does not make files in the GitHub repository confidential.

## Validation

All 26 pages were rendered with Poppler and visually inspected after layout corrections. Text bounds, contacts, all supplied leadership names, relevant hardware/funding figures, source links and PDF structure were checked. The 1.6 MB PDF stays below the deployment response budget.

Automated checks: 140 unit tests and 52 compiled-server HTTP checks, including signed-out rejection, authenticated download hash/size/type, HEAD and post-logout rejection. Public-page and link checks also passed. No messages were sent to investors and no financial terms were accepted.

## Runway and review revision

Three original Runway images illustrate power-to-compute, solar/storage/gas supply and compute infrastructure. Optimized WebP files under `public/assets/investor/` also appear on the investor page with fixed dimensions, lazy loading and concept captions. Prompts and task identifiers are recorded in `docs/runway-investor-artwork.json`; temporary signed provider URLs are not published.

Three simulated investor perspectives informed the decision brief, customer offer, GPU allocation chart, capital-recovery timeline and proposed responsibilities. Their questions, evidence-based answers and diligence-only conclusions are in `docs/investor-review-panel.md`. Neither the images nor the reviews establish physical completion, customer commitments or investment readiness. Financial model inputs were unchanged.

Desktop (1440 px) and mobile (390 px) screenshots were inspected through a local automated authenticated fixture. All images decoded and neither viewport overflowed horizontally. Optional reproduction: set `INVESTOR_VISUAL_QA=1` and, when needed, `INVESTOR_QA_BROWSER=chrome` before the compiled-server HTTP test. This uses test credentials, not a live investor login.

## Institutional visual edition

The 26-page edition now uses native forest-to-emerald and pale-sage PDF gradients, subtle alternating table bands, full-bleed photographic concept backgrounds, a branded B300 cover and a matching image-led website section. Three additional images were generated through the connected Runway account. The product composition uses NVIDIA's DGX B300 enclosure image and the SmartTec logo as references; it remains a generated concept rather than an exact product photograph or evidence of installed hardware. The exact original vector logo remains in the PDF header.

Visual reference: https://docs.nvidia.com/dgx/dgxb300-user-guide/introduction-to-dgxb300.html . Runway prompts, task identifiers and reference-image URLs are preserved in the artwork provenance file. Source images are optimized for delivery without changing the financial model. All 26 pages and local desktop/mobile website screenshots are checked again for this edition.
