# SmartTec investor and website consistency report

Review date: 13 September 2026. Financial basis: upgraded model v6.1.1. All amounts are USD.

The protected investor page, immersive presentation and 26-page PDF now use the same reviewed financial record. The presentation describes SmartTec's two SmartTec-owned infrastructure offerings - shared inference capacity and dedicated GPU servers - plus customer-owned colocation as a separate business line. It does not add revenue from those service descriptions on top of the workbook's modeled GPU-hour revenue.

**Current local release gate: PASS for the reviewed model, investor content, automated tests, compiled application, protected-route integration and PDF.** Production deployment and the live-site smoke test remain pending and are not claimed in this report.

This sign-off confirms that the prepared projections reproduce the reviewed workbook outputs and that the current investor materials state the model's limits. It does not promise a return, verify an unsigned customer commitment or conclude that the project is ready to fund without commercial, legal and engineering diligence.

## 1. Authoritative source and verification

The source workbook was reviewed without modification and is not bundled for public download.

| Item | Verified identity |
| --- | --- |
| Workbook | `SmartTec_B300_Investor_Model_v6.1_1.xlsx`; 667,333 bytes |
| Workbook SHA-256 | `60ef7ae93c731fecee74e31241dd5e2ac3cf669bb74a0668d57f77796aa179aa` |
| Native calculation engine | Microsoft Excel 16.0 build 20326 |
| Formula results | 26,721 populated formula caches; zero missing results or cached errors in each reviewed scenario copy |
| Scenario coverage | Six Phase-1 selector cases and one Base maximum-size sensitivity |
| Canonical website record | `src/data/investor-model-v6-1.json` |
| Canonical record SHA-256 | `03824d8e4bc8584b1cf7a74095e50ba1fa21d1c2f68b0b930cbc1ea3f3ad10de` (repository-normalized bytes) |
| Downloadable protected snapshot | `SmartTec_Model_v6.1_1_Verified_Scenarios.json` |

Seven disposable workbook copies were fully recalculated, saved and reopened in native Excel. Independent checks reconstructed revenue, channel fees, support, EBITDA, operating cash, reserves, receivables, resale, NPV, IRR and XIRR. The source workbook hash was unchanged after the review.

## 2. Verified scenario outputs

**Headline project IRR is the primary return metric because it is the return quoted by the workbook.** Annual-funded IRR and dated-funded XIRR remain clearly labeled timing diagnostics. Headline NPV uses the workbook's annual project-cash series and a 15% hurdle rate.

| Scenario | Initial funding | Headline project IRR | Annual-funded IRR | Dated-funded XIRR | Headline NPV at 15% |
| --- | ---: | ---: | ---: | ---: | ---: |
| Downside merchant plan | $6,739,330.84 | -17.5945% | -17.8236% | -17.8045% | -$4,777,677.55 |
| Base merchant plan | $6,790,216.49 | -2.8017% | -2.8196% | -2.8162% | -$2,981,587.73 |
| Market merchant plan | $6,862,007.11 | 6.6430% | 6.6857% | 6.6772% | -$1,496,759.12 |
| Contracted 40-GPU / 36-month plan | $6,810,597.71 | 4.3225% | 4.3448% | 4.3399% | -$1,762,140.24 |
| Marketplace-heavy merchant plan | $6,908,758.91 | -7.0613% | -7.1088% | -7.0997% | -$3,681,207.42 |
| Delayed customer plan - detailed selector 6 | $6,864,692.24 | -5.3805% | -5.4949% | -5.4884% | -$3,676,770.60 |
| Maximum-size Base sensitivity | $24,848,983.84 | 0.4868% | 0.4898% | 0.4892% | -$9,014,467.18 |

None of the six Phase-1 cases clears the modeled 15% hurdle. The maximum-size Base sensitivity also remains below the hurdle. Contracted does not mean contracted revenue exists today: that case is hypothetical and unsigned.

The Contracted case models 40 GPUs at $6.50 per GPU-hour, a 95% paid share and a 36-month term. Its remaining 20 saleable GPUs use a $7.50 Year-1 merchant reference, 40% paid utilization in Year 1, 50% thereafter and a 10% annual price decline. It assumes no contract renewal. Marketplace and direct-sale fees remain scenario specific.

The Downside case requires a modeled later capital call of $44,578.02. Its operating-only IRR does not resolve and is represented as null rather than replaced with an invented return.

### Delayed-case workbook exception

The workbook has one internal display inconsistency. The `6 Scorecard` row for selector 6 uses an annualized launch-shortfall approximation and reports $6,869,080.44 of initial funding with a -5.3757% headline IRR. The detailed selector-6 plan uses the month-by-month launch cash schedule and reports $6,864,692.24 with a -5.3805% headline IRR. The Scorecard overstates funding by $4,388.21.

The current website source and generated deck use the detailed-plan result because it follows the workbook's full funding rules and reconciles to the displayed annual cash schedule. The exception and decision are stored in the canonical record rather than hidden through rounding.

## 3. Base case: positive operating cash, negative investment return

The Base case requires $6,790,216.49 of initial funding: $5,603,200.00 of hardware, $782,499.44 of infrastructure and $404,517.05 of opening reserve and receivables. Against the owner-reported $6,000,000 of founder funding, the modeled overage is $790,216.49. Availability of those funds and binding contribution terms remain unverified.

| Year | Gross revenue | Operating expense | EBITDA | Operating project cash |
| ---: | ---: | ---: | ---: | ---: |
| 1 | $939,510.00 | $513,115.65 | $426,394.35 | $426,394.35 |
| 2 | $2,152,332.00 | $774,635.31 | $1,377,696.69 | $1,365,505.73 |
| 3 | $1,937,098.80 | $779,407.36 | $1,157,691.44 | $1,157,691.44 |
| 4 | $1,743,388.92 | $932,594.69 | $810,794.23 | $810,794.23 |
| 5 | $1,569,050.03 | $1,096,432.44 | $472,617.59 | $472,617.59 |

All five Base years produce positive operating project cash. The Base headline project IRR is still -2.8017%, headline NPV is -$2,981,587.73 and headline MOIC is approximately 0.903x because operating cash and terminal recovery do not repay the $6.79 million investment within the five-year hold. Operating capital remains unrecovered by $2,557,213.16. Every investor surface now states both the positive annual operating cash and the negative project return together.

## 4. Business-line and ownership consistency

| Topic | Locked presentation |
| --- | --- |
| Shared inference capacity | Multi-tenant inference workloads on proposed SmartTec-owned GPU nodes. |
| Dedicated servers | Single-tenant dedicated GPU servers for customers requiring isolation, using the same proposed SmartTec-owned fleet. |
| Colocation | SmartTec houses customer-owned equipment under separate facility and commercial terms. Colocation revenue is excluded from the B300 ownership model. |
| Revenue boundary | Shared and dedicated are service modes for the modeled fleet. They are not presented as additive fleets or duplicate GPU-hour revenue. |
| Phase 1 capacity | Eight complete eight-GPU systems: 64 installed GPUs, 60 modeled saleable and four held back. Four GPUs do not constitute a complete standby node. |
| Maximum sensitivity | 30 nodes, 240 installed GPUs and 225 modeled saleable GPUs. This is a sensitivity, not commissioned capacity. |
| Commercial evidence | Active customer discussions; no paid pilot or signed customer/offtaker contract is represented as current revenue. |
| Launch energy | Grid power at $0.095/kWh plus $12 per billed peak kW per month. Solar and BESS are a separate future investment. |
| Solar/BESS worksheet | $1.13 million of separate capex, $67,069.26 first-year net saving, 16.85-year simple payback and -6.6264% pre-tax IRR. These values are excluded from the GPU Base case. |
| Site rights | Management reports BC LLC owns the paid-off property and has a signed 50-year commitment with SmartTec. The 1% annual payment is modeled on positive after-tax accounting income. Documents and related-party terms require legal review. |

## 5. Cooling and campus-design boundary

The v6.1.1 financial workbook retains its one-building, air-cooled planning baseline: 128.4 kW modeled IT load, approximately 203.2 kW design-day facility load, two nominal 50-ton chillers and five nominal 40 kW in-row units. Those quantities are preliminary budget inputs, not an installed or professionally approved design.

The approved proposed campus concept places B300 compute in Buildings A and C and uses direct liquid cooling with the Daikin Applied plant concept. That proposal is presented as a design direction. It does not overwrite the financial workbook's air-cooled baseline and is not represented as fully priced. A final equipment schedule, building allocation, electrical design, cooling bill of quantities, vendor quotes and professional engineering review are required before the direct-liquid design can replace the current financial inputs.

This distinction is explicit on the relevant public and investor surfaces so an engineering visualization cannot be mistaken for the cost basis underlying the projected returns.

## 6. Removed investor material

The following obsolete material was removed from the investor experience and supporting code:

- Every instance of **Download your marked layout**, including its download path and supporting marked-layout asset handling.
- The entire **The survey behind the concept.** section.
- The private survey/map data, investor map code and unused MapLibre dependency that supported those features.

The protected investor area continues to provide the reviewed scenario snapshot and current PDF. The private source workbook is not downloadable from the website.

## 7. Reviewed investor touchpoints

| Touchpoint | Current result |
| --- | --- |
| `/investors` | Base capital, all six Phase-1 scenarios, maximum-size sensitivity, annual cash, primary headline IRR, timing diagnostics, service boundaries and diligence needs read from v6.1.1. |
| `/investors/pitch` | Immersive story uses the same scenario order, return metric, Base cash explanation and unsigned-contract qualification. |
| `/investors/presentation` | Protected reader and separate-tab PDF opening use the current presentation artifact. |
| Investor FAQ/bootstrap | Current facts use source ID `model-v6.1.1`; retired ad hoc underwriting endpoints do not supply competing return calculations. |
| Protected scenario download | Serves the reviewed JSON scenario record with the v6.1.1 filename; it does not expose the workbook. |
| Public service pages | Shared inference, dedicated servers and colocation use the same ownership distinctions. Grid-first launch and later solar/BESS are kept separate. |
| Public campus material | Proposed direct-liquid campus design is distinguished from the one-building air-cooled workbook baseline. |

Historical financial libraries may remain in the repository for recordkeeping and tests, but current served investor surfaces do not import them as a second model.

## 8. Verification completed before publication

| Check | Current result |
| --- | --- |
| Workbook arithmetic | Seven native Excel recalculations passed; all 26,721 formula caches were populated without errors; independent revenue/cash/NPV/IRR/XIRR reconstruction reconciled. |
| Full automated test suite | 230/230 tests passed. |
| Focused current-investor tests | 66/66 tests passed. |
| TypeScript | `npm run check` passed. |
| Source formatting | `git diff --check` passed; only line-ending notices were reported. |
| PDF integrity verifier | Passed: 26 pages, canonical v6.1.1 values, service boundaries, disclosures, team, links, source/artifact hashes and text geometry. |
| PDF visual inspection | All 26 pages rendered at 100 DPI and inspected; the changed financial pages were also inspected individually at original detail. No overlap, clipping or material visual defect was found. |
| Application build | Vercel-adapter and Node-adapter production builds passed. |
| Compiled protected-route integration | 174/174 HTTP and Chrome checks passed against the compiled server, including anonymous denial, authenticated fixtures, model/PDF/media integrity, full-screen deck behavior, responsive PDF rendering and session recovery. Production credentials were not used. |
| Production deployment | **Pending.** No GitHub/Vercel publication is claimed in this revision of the report. |
| Live production smoke test | **Pending.** Public route, asset and access-control behavior still requires verification after deployment. |

Protected production pages were not opened with a private investor session, consistent with the owner's earlier direction to review those pages through code and automated tests. This report therefore does not claim a manual review of private production account data.

## 9. Investor-readiness conclusion

The current materials consistently reproduce the upgraded workbook and do not portray positive Base operating cash as a positive investor return. No v6.1.1 Phase-1 scenario currently meets the 15% hurdle, and every contract-dependent improvement remains labeled hypothetical and unsigned.

Before investors rely on any scenario, diligence still needs executed customer/offtaker terms, evidence of founder funds and overage support, hardware and support quotes, utility and carrier evidence, the BC LLC agreement and title review, a finalized direct-liquid design and installed-cost budget, a monthly liquidity plan, resale support, and investor ownership/distribution terms.

The audited local investor content contains no known conflicting financial value or service-line claim after these corrections. Final release sign-off still depends on production deployment and the live smoke test.

## 10. PDF artifact identity

| Artifact | Identity |
| --- | --- |
| Dated presentation | `output/pdf/SmartTec-Investor-Presentation-2026-09.pdf` |
| Stable alias | `output/pdf/SmartTec-Investor-Presentation.pdf`; identical bytes |
| PDF size/pages | 1,606,303 bytes; 26 pages |
| PDF SHA-256 | `bd86c80f2e7d97eaae5038265fcbce8734ed3f1573021dc4a8334a8a561eb49f` |
| Provenance manifest | `src/smarttec-investor/data/investor-deck.json` binds the model version, source workbook, team, credentials and generation inputs |
