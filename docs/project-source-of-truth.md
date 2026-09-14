# SmartTec source of truth — 13 September 2026

This record replaces earlier investor deployment and return narratives. Earlier dated reviews are historical and must not supply live financial copy.

## Financial source

The accepted workbook is `SmartTec_B300_Investor_Model_v6.1_1.xlsx`, 667,333 bytes, SHA-256 `60ef7ae93c731fecee74e31241dd5e2ac3cf669bb74a0668d57f77796aa179aa`. The source remained byte-for-byte unchanged during review. Microsoft Excel 16.0 build 20326 fully recalculated seven disposable copies: the six Phase-1 selector cases and the separate maximum-size Base sensitivity. Each reopened read-only with 26,721 populated formula caches and no cached formula errors.

The reviewed dataset is `src/data/investor-model-v6-1.json`; `financial-model.mjs` is its display facade. Live investor copy, FAQ answers, immersive pitch, model download and PDF use this dataset. Do not revive retired calculator presets or earlier 60-GPU contract sensitivities.

The workbook's quoted return convention is **headline project IRR**, paired with headline NPV at 15% and headline MOIC. Annual-funded IRR and dated-funded XIRR are cash-timing diagnostics. These are unlevered project results before an investor ownership allocation or waterfall.

Base initial funding is **$6,790,216.49**: $5,603,200 hardware, $782,499.44 infrastructure and $404,517.05 opening working cash. Against $6 million of owner-reported founder funding, modeled overage is **$790,216.49**. Base Year-2 operating project cash is **$1,365,505.73**. Every Base year has positive operating cash, yet operating cash alone leaves **$2,557,213.16** of initial capital unrecovered after Year 5. Including modeled terminal recovery, Base headline IRR is **−2.8017%** and headline NPV at 15% is **−$2,981,587.73**. Positive operating cash must never be described as a positive investor return.

The six Phase-1 cases are Downside, Base, Market, Contracted, Marketplace-heavy and Delayed customer. None clears the 15% hurdle. The Contracted case is an unsigned workbook assumption: 40 GPUs at $6.50 per GPU-hour, 95% paid share and 36 months. It is not a customer commitment. The maximum-size Base sensitivity is 30 systems, 240 installed GPUs and 225 saleable GPUs; it needs $24,848,983.84 and has a 0.4868% headline IRR, also below the hurdle.

The selector-6 detailed five-year plan controls the Delayed customer case: $6,864,692.24 initial funding and −5.3805% headline IRR. The workbook Scorecard row uses a simplified launch-shortfall estimate and reports $4,388.21 more initial funding with −5.3757% IRR. Published material uses the detailed plan and discloses this workbook-native inconsistency in the verification report.

## Services and ownership

- Shared inference capacity is planned multi-tenant capacity on SmartTec-owned equipment.
- Dedicated GPU servers are planned single-tenant server capacity on the same SmartTec-owned fleet.
- Colocation houses customer-owned equipment under separately scoped facility agreements.

The financial model covers the SmartTec-owned B300 fleet. It does not add revenue from colocation, token sales, manufacturing, solar or BESS. Shared and dedicated offerings draw from one inventory and cannot duplicate GPU-hours, power or revenue.

## Physical and commercial facts

- Development stage: no commissioned B300 inventory, signed customer contract or paid pilot is established.
- Phase 1: eight complete Supermicro eight-B300 systems, 64 installed GPUs, 60 saleable and four held back in the financial allocation. Four held-back GPUs do not equal a spare eight-GPU node or proven failover.
- Hardware price: $670,000 per complete system, management-reported. Exact SKU, delivery, voltage, cooling configuration, support, warranty and supplier inclusions require documents.
- The upgraded workbook retains an air-cooled, one-building financial baseline. The approved campus concept shows a proposed four-plus-four placement in Buildings A and C with direct liquid cooling. That design needs an exact equipment list, engineering and repricing before it replaces the workbook baseline.
- Grid power at launch: $0.095/kWh plus $12 per billed peak kW per month in the model. Utility capacity, tariff and voltage conversion remain unverified. Solar and BESS are separate future investments; no behind-the-meter saving supports current GPU returns.
- Internet: $48,000 per year in the Phase-1 model, without a confirmed carrier scope.
- Founder funding: management reports $6 million available and willingness to cover overage. Transfer evidence and binding contribution terms remain unverified.
- Site: BC LLC, associated with the CEO, owns the paid-off property. Management reports a signed 50-year commitment and a 1% annual profit payment. The model applies 1% to positive after-tax accounting income; the agreement, definition and investor rights need legal review.
- Six build months and a 1 January 2027 model start are financial assumptions, not launch commitments.

## Release evidence

`docs/model-v6-1-verification.md` records the mathematical checks. `docs/investor-consistency-report-2026-09-13.md` records release-wide checks and deployment identity. PDF bytes, model source hash and generating-code hashes must reconcile to deck metadata. Software QA does not certify customer demand, engineering approval, audited accounts or an investment outcome.
