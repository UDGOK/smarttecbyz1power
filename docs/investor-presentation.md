# Investor presentation, 11 September 2026

The 23-page landscape PDF uses the site's Space Grotesk and Google Sans Code fonts, original vector logo paths, forest/signal/off-white palette and existing labeled concept artwork. The competitor deck informed topic coverage only. No competitor financial statements, biographies, pipeline, valuation multiples or claims were reused as SmartTec facts.

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

All 23 pages were rendered with Poppler and visually inspected after layout corrections. Text bounds, contacts, all supplied leadership names, relevant hardware/funding figures, source links and PDF structure were checked. The 1.3 MB PDF stays below the deployment response budget.

Automated checks: 140 unit tests and 48 compiled-server HTTP checks, including signed-out rejection, authenticated download hash/size/type, HEAD and post-logout rejection. Public-page and link checks also passed. No messages were sent to investors and no financial terms were accepted.
