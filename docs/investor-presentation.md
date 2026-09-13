# Investor presentation — current v6.1 edition

The private investor page, 13-chapter immersive pitch and 26-page PDF use the same reviewed financial snapshot at `src/data/investor-model-v6-1.json`. The current edition is grid-first, with shared inference and dedicated servers on SmartTec-owned hardware plus separately scoped customer-owned colocation.

Primary returns use dated funded project IRR; the negative Base case is shown alongside explicitly unsigned contract sensitivities. Revenue, operating cash, cash distributions, asset disposal and final receivable collection are distinct. See the source-of-truth and model-verification records for assumptions and limitations.

Rebuild with `node tools/export-investor-deck-data.mjs`, then `python tools/build-investor-deck.py`. Validate with `python tools/verify-investor-pdf.py` and the investor-deck unit tests. Render every PDF page with Poppler and inspect it after a layout/content change. Metadata binds the PDF bytes to the canonical model, builder, exporter, roster and credentials hashes.

The PDF is available only through authenticated `/api/investor/presentation`; the reader at `/investors/presentation` opens in a new tab and offers fullscreen and download controls. `/investors/pitch` provides optional sound and film. The authentication, no-store headers, session expiry and same-origin frame protections remain enforced. Historical calculator API routes return 410 after authentication and request verification; `/api/investor/model` downloads the reviewed snapshot.

The original workbook remains a supplied local source, not a new public website asset. The PDF and investor page explain modeled figures and evidence requirements; software and arithmetic verification do not certify customer contracts, tariff, equipment quotes, engineering or investor terms.
