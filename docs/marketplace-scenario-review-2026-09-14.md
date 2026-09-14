# SmartTec marketplace scenario review

14 September 2026. All amounts USD. Analysis only; published investor materials have not been replaced by these scenarios.

## Results

| Five-year project scenario | Initial capital | Project IRR | NPV at 15% |
|---|---:|---:|---:|
| 90% paid utilization from launch; $6.50 held flat | $6,977,011 | 9.78% | -$930,164 |
| 55% first operating period, then 90%; $6.50 held flat | $6,909,324 | 7.04% | -$1,457,971 |
| 90% from launch; price declines 10% annually | $6,977,011 | 3.46% | -$1,902,160 |

Positive operating cash and positive project IRR are supported under these assumptions. None reaches the existing 15% project hurdle. These are unlevered after-tax project returns, not the return on a specific investor's security or ownership share.

## Commercial basis

- Management confirms a 20% platform deduction from the $6.50 customer GPU-hour price: SmartTec receives $5.20 per rented GPU-hour before operating costs.
- Eight complete systems contain 64 GPUs; 60 are billable and four held back. At 90% paid utilization, a full model operating year generates $3,074,760 gross revenue, $614,952 platform fees and $2,459,808 receipts before operating costs.
- Management describes a signed three-year marketplace relationship, with payment only when capacity is rented. It is not a take-or-pay customer agreement, a fixed-price lease or guaranteed utilization. The provider is unnamed here.
- November 1, 2026 is the planned first-billing date. A forecast does not establish physical readiness or completed customer acceptance.

## Timing and sensitivity assumptions

- For this comparison only, funding is assumed on October 1, 2026. One pre-revenue month precedes November 1 billing. Equipment delivery, commissioning power and staffing are assumed to start in model month 1. This compressed implementation schedule requires evidence and is not an established procurement schedule.
- Model Year 1 runs October 2026–September 2027 and has eleven operating months. The five-year forecast ends September 2031. Annual billing uses the source workbook's 8,760-hour convention, not an actual calendar-month invoice schedule.
- The slower-ramp case uses 55% paid utilization throughout the first eleven operating months and 90% thereafter. It is an illustrative stress case, not a forecast supplied by management.
- The flat-price cases assume $6.50 for the entire five-year forecast. This is a sensitivity, not a contractually protected price. The declining-price case reduces the rate by 10% each model year.
- All cases assume continued marketplace access or replacement sales channels after the stated three-year relationship. Years 4–5 are not supported by a confirmed renewal or committed customer revenue. The 20% fee is assumed throughout.

## Annual operating cash: 90% from launch, flat pricing

| Model year | Gross revenue | Total operating expense, including platform fee | Cash after operating tax and BC LLC payment |
|---|---:|---:|---:|
| 1 | $2,818,530 | $1,189,149 | $1,511,813 |
| 2 | $3,074,760 | $1,266,134 | $1,644,903 |
| 3 | $3,074,760 | $1,285,669 | $1,630,398 |
| 4 | $3,074,760 | $1,574,237 | $1,416,136 |
| 5 | $3,074,760 | $1,628,152 | $1,376,104 |

The IRR also includes source-model terminal asset disposal, associated tax and reserve release. Those exit receipts are excluded from the operating-cash column above. Initial capital exceeds the earlier Base because reserve/receivable funding changes with the scenario. Compared with the reported $6 million founder contribution, the target case requires approximately $977,011 more initial funding.

## Preserved costs and limitations

The analysis retains the v6.1.1 workbook's equipment, infrastructure, energy/demand, personnel, insurance, administrative costs, software, internet, property tax, maintenance, support, inflation, depreciation, tax/loss rules, BC LLC share, receivables, reserve and resale methods. The full 20% fee applies to all rental revenue; no direct-sale revenue or duplicate fee is added.

The source workbook still prices a one-building air-cooled installation. The newer direct-liquid design across Buildings A and C needs updated quotes. These returns cannot be represented as a fully priced direct-liquid deployment. Terminal resale is an assumption, not a guaranteed buyback. A three-year marketplace agreement does not imply that three-year equipment payback is achieved.

## Verification

The previously audited native Excel Base copy was opened read-only; its original -2.80172869% IRR reconciled before temporary in-memory input changes. All cases were recalculated with Excel, and the workbook was closed without saving. Source hash remained unchanged.

An independent calculation reconstructed gross revenue, the 20% fee, all operating expense line totals, EBITDA, depreciation effects, operating taxes, loss carryforwards, BC LLC payments, sale taxes, annual project cash, IRR and NPV. Each case reconciled within $0.000001, including the workbook's headline/funded cash reconciliation.

Before public use, identify these as new management-target scenarios distinct from the unchanged v6.1.1 source scenarios. Confirm the implementation timetable, price/fee semantics, post-three-year route to market and installed direct-liquid budget.

## Capacity roadmap: initial deployment to 240 GPUs

Management reports that campus infrastructure is designed for up to 240 B300 GPUs. This is a design target pending engineering and utility confirmation, not commissioned capacity.

| Stage | Eight-GPU systems | Installed GPUs | Saleable allocation | Held back |
|---|---:|---:|---:|---:|
| Initial | 8 | 64 | 60 | 4 |
| Expansion target | 30 | 240 | 225 | 15 |
| Increment | 22 | 176 | 165 | 11 |

The 9.78% target-case project IRR above applies only to the initial 64-GPU fleet. It must not be multiplied or attributed to the 240-GPU target. The unchanged v6.1.1 maximum Base sensitivity models approximately $24.85 million total initial funding and 0.49% headline project IRR under its original commercial assumptions. It is not a recalculation at 90% paid utilization and a 20% marketplace fee, or a priced liquid-cooled expansion.

Expansion requires additional server funding and a refreshed installed-cost budget, documented customer demand, utility delivery and distribution capacity, direct-liquid cooling and residual heat removal, and networking capacity. The initial funding does not purchase the additional 22 systems. GPU holdbacks are financial allocations, not complete spare nodes or proof of failover.
