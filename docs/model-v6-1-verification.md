# Investor model v6.1.1 upgraded-source verification

Reviewed 13 September 2026. The investor website and deck dataset is `src/data/investor-model-v6-1.json`. Currency is USD; rates in that file are fractions. Results are conditional project projections, not realized performance or a promised investor return.

## Source and reproducibility

- Workbook: `SmartTec_B300_Investor_Model_v6.1_1.xlsx`, 667,333 bytes.
- SHA-256: `60ef7ae93c731fecee74e31241dd5e2ac3cf669bb74a0668d57f77796aa179aa`.
- The source hash was identical before and after review.
- Microsoft Excel 16.0 build 20326 fully recalculated one disposable copy for each of the six Phase-1 selector values plus a Base maximum-size copy. Every copy was saved, reopened read-only and checked.
- Every copy contained 26,721 populated formula caches with zero cached errors or missing formula results.
- Independent checks reconstructed revenue, channel fees, support, EBITDA, operating project cash, reserve and receivables movements, terminal recovery, NPV, IRR and XIRR. Base and maximum-size differences were below one cent; the largest cash-reconciliation difference was $0.000000002.
- Reproduction records are under workspace `analysis/v6-1-1/` and are excluded from the published website.

## Verified selector outputs

**Headline project IRR is the workbook's quoted return metric.** Headline NPV uses the same annual project-cash series at the 15% hurdle. Annual-funded IRR and dated-funded XIRR are distribution-timing diagnostics. None of the six Phase-1 selector cases clears 15%.

| Scenario | Initial funding | Headline project IRR | Annual-funded IRR | Dated-funded XIRR | Headline NPV at 15% | Headline MOIC | Operating capital recovery |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Downside | $6,739,330.84 | −17.5945% | −17.8236% | −17.8045% | −$4,777,677.55 | 0.475× | Not in hold; $5,405,231.13 unrecovered |
| Base | $6,790,216.49 | −2.8017% | −2.8196% | −2.8162% | −$2,981,587.73 | 0.903× | Not in hold; $2,557,213.16 unrecovered |
| Market | $6,862,007.11 | 6.6430% | 6.6857% | 6.6772% | −$1,496,759.12 | 1.244× | Not in hold; $84,370.36 unrecovered |
| Contracted | $6,810,597.71 | 4.3225% | 4.3448% | 4.3399% | −$1,762,140.24 | 1.145× | Not in hold; $942,556.13 unrecovered |
| Marketplace-heavy | $6,908,758.91 | −7.0613% | −7.1088% | −7.0997% | −$3,681,207.42 | 0.762× | Not in hold; $3,673,990.73 unrecovered |
| Delayed customer, detailed plan | $6,864,692.24 | −5.3805% | −5.4949% | −5.4884% | −$3,676,770.60 | 0.802× | Not in hold; $3,337,935.52 unrecovered |
| Maximum-size Base sensitivity | $24,848,983.84 | 0.4868% | 0.4898% | 0.4892% | −$9,014,467.18 | 1.017× | Not in hold; $6,299,472.30 unrecovered |

The Contracted case assumes 40 GPUs at $6.50 per GPU-hour, 95% paid share and a 36-month term. The remaining 20 saleable GPUs use a $7.50 Year-1 merchant reference, 40% Year-1 and 50% later paid utilization, a 10% annual rate decline and merchant fees. This selector is hypothetical and unsigned. No renewal is assumed.

The workbook contains one internal scenario-display inconsistency. Scorecard row 81 uses a simplified launch-shortfall estimate for Delayed customer and reports $6,869,080.44 initial funding with −5.3757% headline IRR. Recalculating selector 6 in the detailed `5A Five-Year Plan (Phase 1)` produces $6,864,692.24 and −5.3805%. The difference is $4,388.21 of initial funding. The detailed plan follows the full funding rules used by the published annual cash schedule, so the website and deck publish its result. The other five Scorecard Phase-1 IRRs match their detailed selector plans.

## Base capital and annual cash

| Capital item | Amount |
| --- | ---: |
| Eight complete B300 systems | $5,360,000.00 |
| Shared storage and spares | $80,000.00 |
| Freight and tax allowance | $163,200.00 |
| Infrastructure | $782,499.44 |
| Opening reserve and receivables | $404,517.05 |
| **Total initial funding** | **$6,790,216.49** |
| Owner-reported founder funding | $6,000,000.00 |
| **Modeled overage** | **$790,216.49** |

| Year | Gross revenue | Operating expense | EBITDA | Operating project cash | Headline project cash including terminal items |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | $939,510.00 | $513,115.65 | $426,394.35 | $426,394.35 | $426,394.35 |
| 2 | $2,152,332.00 | $774,635.31 | $1,377,696.69 | $1,365,505.73 | $1,365,505.73 |
| 3 | $1,937,098.80 | $779,407.36 | $1,157,691.44 | $1,157,691.44 | $1,157,691.44 |
| 4 | $1,743,388.92 | $932,594.69 | $810,794.23 | $810,794.23 | $810,794.23 |
| 5 | $1,569,050.03 | $1,096,432.44 | $472,617.59 | $472,617.59 | $2,374,522.64 |

Every Base year has positive operating project cash. The headline investment return remains negative because those annual amounts and terminal recovery do not compensate for the initial $6.79 million within the five-year hold. Published copy states both facts together.

## Operating assumptions and boundaries

- Phase 1 models eight eight-GPU nodes: 64 installed, 60 saleable and four held back.
- Base starts at $6.50 per GPU-hour, 55% paid utilization in Year 1 and 70% thereafter, with a 10% annual rate decline and six build months.
- Grid power is $0.095/kWh plus $12 per billed peak kW per month. Average PUE is 1.30. Solar/BESS capex and savings are separate.
- Phase-1 internet is $48,000 per year. Scope, bandwidth, route diversity and actual carrier price are not confirmed.
- Support is assumed included for 36 operating months, then 5% of the complete-system purchase subtotal annually before 3% cost inflation.
- Hardware resale is 20% in Year 5; infrastructure recovery is 50%. Neither has a guaranteed buyer.
- The model retains an air-cooled, one-building financial scope. The approved A/C campus concept uses direct liquid cooling and needs an exact bill of quantities, engineering and repricing.
- The standalone 600 kW solar / 1,000 kWh BESS worksheet requires $1.13 million, models $67,069.26 first-year net saving, 16.85-year simple payback and −6.6264% pre-tax IRR. It is not included in the GPU Base case.

## Dataset contract

Use `returns.headlineIrr`, `returns.npvUsd` and `returns.moic` together for the primary presentation. Use `returns.annualFundedIrr`, `returns.datedFundedIrr`, `returns.annualFundedNpvUsd`, `returns.datedFundedNpvUsd` and `returns.fundedMoic` only as timing diagnostics and label them accordingly. `annual[].operatingCashUsd`, `annual[].distributionsUsd`, receivables, reserve movements and asset disposal are distinct. `annual[].resaleTaxUsd` is a signed cash flow. A null `operatingPaybackYears` means operating cash does not recover capital within the hold.

All values are exported at source precision; display rounding is presentation only.
