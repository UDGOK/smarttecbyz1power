# SmartTec: assessing the behind-the-meter power advantage

Owner reports an agreement for solar, batteries and gas generators at below $0.07/kWh. He is awaiting a team reply on exclusive continuous capacity, all-in cost coverage, operating date and agreement details. The exact pending questions are saved in project-source-of-truth.md. Existing project records describe shared OG&E service and planned solar/storage. This review does not resolve or overwrite that distinction.

## Investor recommendation

Build the investment case around verified power access, customer-backed demand and phased capital commitments. Compare customer-owned hosting with owned compute for the actual customer workload. Do not buy more GPUs solely to increase the headline revenue projection. Customer-owned equipment reduces GPU acquisition exposure, but the current 100 kW hosting test also fails its return hurdle; hosting must be separately priced and underwritten.

Before a major equipment purchase, require: an engineer-confirmed usable allocation and commissioning plan; documented all-in power and network costs; a customer commitment with minimum payments and defined service obligations; and supplier/site quotes. Recompute investor distributions from actual legal terms, not a public-cloud rate card.

## How much cheaper electricity helps

These are sensitivities to the previously disclosed base assumptions, not forecasts. All non-power inputs and the opening reserve stay unchanged. The 3-cent case is hypothetical, not a claim about SmartTec power.

| Deployment | Electricity | Five-year net project cash profit/loss | NPV at 15% |
|---|---:|---:|---:|
| planned-mix | $0.10/kWh; demand unchanged | -$1,077,455 | -$1,133,002 |
| planned-mix | $0.05/kWh; demand unchanged | -$1,005,938 | -$1,086,257 |
| planned-mix | $0.03/kWh; demand unchanged | -$977,331 | -$1,067,503 |
| planned-mix | $0.00/kWh; demand unchanged | -$934,421 | -$1,039,308 |
| planned-mix | Zero energy AND demand charges | -$832,867 | -$970,384 |
| b200-scale | $0.10/kWh; demand unchanged | -$606,160 | -$893,943 |
| b200-scale | $0.05/kWh; demand unchanged | -$506,718 | -$825,071 |
| b200-scale | $0.03/kWh; demand unchanged | -$466,941 | -$797,512 |
| b200-scale | $0.00/kWh; demand unchanged | -$407,276 | -$756,173 |
| b200-scale | Zero energy AND demand charges | -$292,599 | -$675,481 |
| customer-hosting | $0.10/kWh; demand unchanged | -$1,229,485 | -$1,043,073 |
| customer-hosting | $0.05/kWh; demand unchanged | -$978,009 | -$870,516 |
| customer-hosting | $0.03/kWh; demand unchanged | -$877,419 | -$803,271 |
| customer-hosting | $0.00/kWh; demand unchanged | -$726,533 | -$711,362 |
| customer-hosting | Zero energy AND demand charges | -$535,405 | -$616,180 |

Zero-charge cases deliberately add no generation capital, fuel, maintenance or replacement costs. They are generous ceilings on the benefit of removing the modeled electricity bill alone, not deployable power plans. None eliminates the loss at the other current base assumptions. Better contracts, lower installed cost or a different operating scale could change the outcome and must be tested explicitly.

## Evidence needed to include behind-the-meter power

1. Power source and equipment: utility supply, gas generation, solar, battery storage, or a documented combination. A battery shifts energy and can provide backup; its charging cost, losses and replacement costs remain part of the economics.
2. Exclusive continuous kW available for SmartTec after other campus uses, derating, cooling and redundancy. State generation kW and storage kWh separately, together with outage autonomy at the proposed load.
3. All-in cost per delivered kWh: fuel/purchased energy, demand/standby charges where applicable, operating and maintenance costs, efficiency losses, equipment funding and replacement. Identify which entity bears each cost.
4. Operating status, commissioning evidence and supply duration; ownership or enforceable supply terms, curtailment provisions and backup arrangements.
5. The revenue benefit: lower delivered energy cost, earlier service availability, or demonstrated reliability that a customer will pay for. Do not count a price premium, avoided charge or grid-service income without support.

## External context

- [DOE: distributed energy resources and microgrids](https://www.energy.gov/cmei/systems/solar-integration-distributed-energy-resources-and-microgrids-basics): behind-the-meter generation and storage can support local consumption; the configuration matters.
- [DOE: powering AI and data-center infrastructure recommendations](https://www.energy.gov/sites/default/files/2024-08/Powering%20AI%20and%20Data%20Center%20Infrastructure%20Recommendations%20July%202024.pdf): assess cost, performance, reliability, availability and other deployment constraints for grid and behind-the-meter options.

Calculated using the tested SmartTec monthly cash-flow engine. The private investor page labels the below-7-cent statement as owner-reported and provides a 7-cent sensitivity. It does not claim verified capacity, operating status or an all-in delivered power cost.

At $0.07/kWh, the planned RTX/B300 base case improves by approximately $42,910 over five years, but still loses $1,034,545. The B200 expansion base case still loses $546,495; its favorable case reaches approximately 18.2% annualized project IRR before any additional generation/storage obligations. These are conditional sensitivities, not verified investment returns.
