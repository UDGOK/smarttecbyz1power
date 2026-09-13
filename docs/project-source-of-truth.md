# SmartTec source of truth — 13 September 2026

This record replaces the earlier investor deployment and partial-budget narrative. Earlier dated review documents are historical and must not be used to generate live financial copy.

## Financial source

The accepted workbook is `SmartTec_B300_Investor_Model_v6.1.xlsx`, SHA-256 `297c9fa394193d02871016b8f1d9b7586f1d62df4483efd7ea69acaedd421c4e`. Its independently recalculated, reviewed snapshots are in `src/data/investor-model-v6-1.json`. `financial-model.mjs` provides display helpers and current service/evidence records. All published scenario values derive from that snapshot. Do not revive the retired monthly ROI engines or historical calculator presets on live routes.

Primary return convention: dated funded project IRR (XIRR), dated NPV at 15%, and funded cash multiple. These include modeled tax, BC LLC payments, cash-retention policy and terminal disposal assumptions; they are not investor-security returns. Headline annual IRR and operating-only IRR are separate metrics and must be labeled when shown.

Base initial funding is $6,934,754.57, with a negative five-year dated IRR. The full-fleet $7.50/60-month sensitivity has different working cash and initial funding of $7,030,329.29. Never pair one case's capital with another case's return without naming both assumptions. Exact data and cash tables control over rounded prose.

## Services and ownership

- Shared inference capacity: planned multi-tenant GPU capacity using SmartTec-owned equipment.
- Dedicated GPU servers: planned single-tenant isolation using SmartTec-owned equipment.
- Colocation: SmartTec houses customer-owned equipment and supplies scoped facility services.

The first two constitute SmartTec-owned server hosting. The B300 financial model covers that owned fleet. No extra revenue is added for colocation, token resale, manufacturing, solar or BESS. Capacity cannot be double-counted across the service offerings. Rates in the model are hypothetical gross billing assumptions, not published tariffs or executed prices.

## Physical and commercial facts

- Development stage: no commissioned B300 inventory, signed customer contract or paid pilot established.
- Proposed first purchase: eight complete Supermicro eight-B300 systems, 64 total GPUs, 60 saleable and four held back. Four held-back GPUs do not equal a full spare node or proven redundancy.
- Hardware price: $670,000 per complete system, management-reported. SKU, service inclusions, warranty dates, voltage and air/liquid configuration require supplier confirmation.
- All initial systems are planned together in one building; usable layout and building selection require review. Existing-building gross areas are not approved IT floor allocations.
- The v6.1 budget uses an air-cooled planning basis with new chilled-water room/in-row cooling: two nominal 50-ton chillers and five 40-kW in-row units including spares. Earlier direct-liquid/two-loop artwork is a separate concept, not the selected bill of quantities.
- Grid power at launch. Model energy allowance 9.5 cents/kWh plus $12/billed peak kW/month. Firm tariff, capacity and voltage conversion remain unverified. Solar/BESS form a separate future investment; behind-the-meter savings are excluded from current returns.
- Internet: $48,000/year Phase-1 model allowance, not a contracted bandwidth package. An earlier $8,075/month carrier option had different/unreconciled scope. Carrier capacity, directional speeds, egress, install and recurring prices need reconciliation before a quote is treated as within this allowance.
- Founder capital: $6 million available and willingness to fund overage, management-reported; binding terms, availability and transfers not independently verified.
- BC LLC is the related-party landowner. Management reports a signed 50-year commitment and a 1% annual profit payment. The model pays 1% of positive after-tax accounting income; legal definition and investor rights require reconciliation. Land is not SmartTec-owned investor collateral.
- 39.39 acres is the current owner-supplied legal parcel area. Historical survey tract labels total 39.21 acres. Neither number should silently replace the other's documentary context.
- Six-month build and 1 January 2027 workbook start are modeling inputs, not a committed launch date.

## Release evidence

Use `docs/model-v6-1-verification.md` for mathematical checks and `docs/investor-consistency-report-2026-09-13.md` for full-site release scope and limitations. PDF bytes, canonical model hash and source workbook hash must reconcile to deck metadata. No document review, site engineering approval, audited accounts or guaranteed investor outcome is implied by software QA.
