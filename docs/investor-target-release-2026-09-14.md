# Current investor target release — 14 September 2026

## Correction

The capacity-only release c5d099e left the older -2.80% workbook Base as the headline. The current release replaces that headline across the investor page, PDF, immersive deck, curated answers and protected JSON export with the recalculated management target. This is a change of assumptions and matching financial series, not a cosmetic IRR substitution.

## Current financial basis

- Initial installed/saleable GPUs: 64 / 60; four held out of billing.
- Customer rental price: $6.50 per GPU-hour, flat through five years in the target.
- Paid utilization: 90% from first billing; 21.6 rented hours per day, not uptime.
- Marketplace deduction: 20% of all gross rental revenue; $5.20 per rented hour remains before other costs.
- Planned first billing: November 1, 2026. Funding assumed October 1, 2026; one pre-revenue month. Model Year 1 has eleven operating months; hold ends September 2031.
- Management reports signed three-year marketplace access. No guaranteed occupancy, minimum receipts or protected price is established. Provider name is withheld. Years 4–5 assume continued access or replacement channels.
- Initial funding: $6,977,011.21; reported founder-funding gap $977,011.21.
- Year 2 gross billing: $3,074,760.00; EBITDA $1,808,626.44; operating cash after operating tax/site share $1,644,902.84.
- Five-year headline project IRR: 9.77589865% (9.78% displayed). NPV at 15%: $-930,164.28. The return is positive and below the unchanged hurdle.
- Total operating cash: $7,579,353.63; operating payback 4.56 years by annual interpolation. Headline IRR also includes assumed asset disposal, sale tax and reserve release.
- Sensitivities: slower ramp 7.04%; 10% annual price decline 3.46%. Their complete capital/cash series use the same verified methods.

## Scope and limitations

The unchanged v6.1.1 workbook supplies the original equipment and one-building air-cooled cost basis. Direct-liquid cooling across Buildings A/C remains unpriced and requires a refreshed budget. Delivery, staffing and commissioning power are assumed from month 1; the compressed schedule requires evidence. The 240-installed / 225-saleable GPU design target is not assigned the initial fleet's 9.78% IRR. Its original maximum sensitivity is explicitly historical. No investor-specific waterfall or guaranteed return is claimed.

## Traceability

- Active data: `src/data/investor-model-current.json`.
- Native calculation record: `docs/model-audit/marketplace-results-2026-09-14.json`; normalized SHA-256 `046bf4740393a8719e5dc28442fdd26141d2145dcb43d1b5356bf90cbd49ffd2`.
- Independent numeric checks: `tests/marketplace-target.test.mjs`; legacy workbook arithmetic tests retained independently.
- PDF: 26 pages / 1,606,224 bytes / SHA-256 `bb7f1da634855106aa2225b7c8d41a051f91ee73ba8890ec270de6c3c0a54cc8`. Both PDF filenames and authenticated embedded bytes match.
- Website financial tables, deck values and protected export share the active snapshot; PDF provenance binds the snapshot and builder.

## Verification record

230 unit tests passed, including independent target revenue, 20% fee, expense totals, tax/loss rules, site payments, operating cash, headline IRR and NPV. PDF source/hash/value/geometry verification passed. All 26 PDF pages rendered and visually reviewed. Compiled browser and deployment checks are recorded in the release workflow and final task confirmation.

Compiled investor verification: 176 HTTP/Chrome checks passed, including all chapters, desktop/mobile tables, native fullscreen, PDF render/download and session recovery. Public static QA: 505 checks plus 158 page checks passed. Final PDF copy edits were revalidated for geometry, values and provenance.
