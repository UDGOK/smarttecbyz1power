# Investor model v6.1 verification

Reviewed 13 September 2026. The canonical website/deck dataset is `src/data/investor-model-v6-1.json`. Currency is USD; rates in that file are fractions, so `0.15` means 15%. Figures are planning projections, not realized performance or a guarantee of an investor's return.

## Source and reproducibility

- Workbook: `SmartTec_B300_Investor_Model_v6.1.xlsx`, 479,453 bytes.
- SHA-256: `297c9fa394193d02871016b8f1d9b7586f1d62df4483efd7ea69acaedd421c4e`.
- The original workbook remained unchanged. Full recalculation ran in installed Microsoft Excel 16.0, build 20326, on disposable copies; the restored Base copy was saved and reopened successfully.
- All 26,721 source formulas have cached results and none has a cached error. Source caches and recalculated Base results agree within the documented numerical tolerance; strings and dates agree exactly. Native Excel and independent XIRR calculations differ by less than 0.0000005 percentage points across the exported scenarios.
- Independent checks reconstructed contracted/merchant revenue, term expiry, operating-cash arithmetic, receivables, funded reserve draws, later calls, distributions, final collections, NPV, IRR and XIRR. Financial reconciliation differences were below $0.000001 in each scenario. The check includes the maximum-build case.
- Reproduction scripts and full diagnostics are in workspace `analysis/v6-1/native_snapshot.ps1`, `analysis/v6-1/build_snapshot.py`, `analysis/v6-1/native_results.json` and `analysis/v6-1/independent_checks.json`.

## Verified scenario outputs

The investor-facing primary return is **dated funded-cash XIRR**, using the funded reserve and placing the final receivable after the asset sale. Headline IRR is the workbook's separate annual accrual convention. NPV below uses the dated funded cash at the 15% hurdle. MOIC is total investor cash received divided by total investor capital contributed; it includes modeled resale. Operating payback excludes resale.

| Scenario ID | Initial capital | Hold | Headline IRR | Annual funded IRR | Dated funded XIRR | Dated NPV at 15% | MOIC | Operating payback |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| base | $6,934,754.57 | 5 years | −3.1033% | −3.1227% | **−3.1190%** | −$3,089,279 | 0.893× | Not within hold |
| contracted-36 | $7,030,329.29 | 5 years | 13.4537% | 13.5229% | **13.5081%** | −$257,057 | 1.458× | 3.42 years |
| contracted-60 | $7,030,329.29 | 6 years | 21.2835% | 21.2718% | **21.2499%** | $1,330,611 | 1.947× | 3.27 years |
| contracted-60-at-650 | $6,986,792.69 | 6 years | 16.0704% | 16.0621% | **16.0455%** | $215,134 | 1.693× | 3.74 years |
| delayed | $7,011,274.20 | 5 years | −5.6026% | −5.7197% | **−5.7130%** | −$3,741,310 | 0.793× | Not within hold |
| maximum-base | $25,155,237.27 | 5 years | 0.2723% | 0.2740% | **0.2737%** | −$9,224,016 | 1.010× | Not within hold |

Base starts after six build months, with a $6.50 merchant GPU-hour reference, 10% annual rate decline, 55% utilization in the first operating year and 70% thereafter. The delayed case begins after 12 build months. Maximum Base is a preliminary engineering sensitivity, not an approved expansion plan.

**Every contracted case is hypothetical and unsigned.** Each assumes 60 paid-capacity GPUs, 95% contracted paid share, 2% contract fees and no renewal. `contracted-36` assumes $7.50 for 36 service months, from model month 7 through 42. `contracted-60` assumes $7.50 for 60 service months, from month 7 through 66, with sale after month 72. `contracted-60-at-650` changes that contract rate to $6.50. These scenarios retain the Contracted preset's merchant fallback: a $7.50 initial merchant reference declining 10% annually, 50% post-term utilization and 6.6% merchant fees. The $6.50 sensitivity does not substitute the Base merchant fallback. Cash capital is recalculated separately for each scenario.

The Base plan falls short of the 15% hurdle. The 36-month contracted case also falls short. Longer-term contract sensitivities clearing the hurdle are conditional outputs, not evidence that those contract prices, payment terms, utilization or resale values can be achieved. No investment security, equity split, investor distribution waterfall or actual financing terms have been priced by this unlevered project model.

## Capital and operating assumptions

Base Phase 1 installs eight eight-GPU nodes: 64 GPUs installed, 60 saleable and four held back. Hardware totals **$5,603,200**: $5,360,000 for nodes, $80,000 for storage/management/spares, and $163,200 for freight/rigging/tax. Infrastructure is **$926,139.77**. Launch cash reserve plus receivables is **$405,414.81**, with no additional Base launch shortfall. The delayed case adds a **$96,255.53** launch shortfall to its own $385,678.90 reserve. Owner-reported available founder capital is $6 million, leaving a modeled Base funding gap of $934,754.57; availability and commitment were not independently verified.

Actual modeled Base Year-1 revenue is **$939,510**, operating expense **$515,749.06**, and operating cash **$423,760.94**. Year 2 revenue is **$2,152,332**, operating expense **$778,334.05**, EBITDA **$1,373,997.95**, and operating cash **$1,362,596.84**. The capital sheet's annual running-cost allowance is used to size the launch reserve; it must not be presented as actual Year-1 ramp-period expense.

Grid power is the launch strategy. The model assumes **$0.095/kWh**, **$12/kW-month** demand charges and billed peak demand at 90% of modeled worst-day facility load; these are tariff assumptions requiring utility confirmation. Solar/BESS savings and their capital investment are excluded from the six exported project cases. Average modeled PUE is 1.30. Phase 1 models 128.4 kW IT load, 203.159 kW worst-day facility load and 182.843 kW billed demand.

The model's Phase-1 connectivity allowance is **$48,000/year ($4,000/month)**. An earlier management-reported **$8,075/month** carrier option is unconfirmed and its service scope needs reconciliation with this allowance. Neither is an accepted quote for a complete bandwidth commitment. This is a procurement/diligence gap, not an arithmetic error in the supplied workbook. Post-warranty support is 5% of the **complete B300 system purchase subtotal** before escalation; separate storage/spares and freight/tax are excluded from that support-cost basis.

Preliminary cooling is 40.159 tons of design heat load, two 50-ton chillers and five 40-kW in-row coolers. These are modeled quantities and allowances, not verified equipment selections or an engineered design. Exact server SKU, supply voltage/conversion, utility capacity, equipment derating and installed costs remain subject to supplier/engineering review.

## v6.1 fixes and scope of verification

- Year-end receivables now use the final operating month's invoice. This matters in years when fixed contracts expire: the 36-month case's Year-4 receivable is $119,738.25; the 60-month case's Year-6 receivable is $96,987.98. Neither uses that mixed year's average invoice.
- The date strip uses model start 1 January 2027, anniversary cash dates, and final collection 30 days after the sale. Five-year terminal collection is 31 January 2032; six-year terminal collection is 31 January 2033. Dated XIRR also reflects actual day counts, including leap days. It remains an annual-distribution model, not a fully monthly cash forecast over the whole hold.
- The funded reserve is raised at inception. Launch losses draw it down; distributions occur only above the stated reserve target. The target is a distribution policy, not an enforced minimum cash balance. Later annual capital calls equal zero in all six exported cases. The delayed case's initial funded shortfall is not counted as another annual investor contribution.
- Total-cash conservation is independently verified, but the workbook's same-total-cash check alone does not prove customer collections or intrayear liquidity. The separate launch schedule covers only its first 24 months.
- Support coverage correctly clips to operating months. In the delivery-start regression at a 2% included support rate, the six-month build has 6/12/12/3 included operating months across Years 1–4. With a 12-month build those become 0/12/12/3; there is no support expense attributed to non-operating Year-1 months.
- Default hardware resale is 20% of modeled hardware capital in Year 5 and 15% in Year 6; infrastructure resale is 50%. Gross sale proceeds, sale tax and reserve release remain distinct fields. These are assumptions without a guaranteed buyer. The advertised IRRs and MOICs must retain this context.

## Dataset integration contract

Use `returns.datedFundedIrr`, `returns.datedFundedNpvUsd` and `returns.fundedMoic` together for the funded investor-cash presentation. `returns.headlineIrr` and `returns.npvUsd` belong to the separate annual headline method. `annual[].operatingCashUsd` is accrual-derived operating cash; `annual[].distributionsUsd` is the modeled funded-cash distribution before separate terminal receivables and asset disposal. Do not treat these fields as interchangeable. `annual[].resaleTaxUsd` is a signed negative cash flow. A null `operatingPaybackYears` means capital is not recovered from operations within the modeled hold.

All annual and dated cash amounts are exported at source precision. Display rounding is for presentation only; consumers should use the canonical raw values and should not rederive headline financial claims from rounded labels.

`annual[].contractMonths` is normalized to zero when a scenario has no contracted GPUs. The workbook's raw overlap formula calculates potential term months even in merchant-only scenarios; this export normalization changes no financial result.
