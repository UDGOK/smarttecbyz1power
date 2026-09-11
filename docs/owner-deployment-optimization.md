# SmartTec: smallest deployment versus investor return

B300-only is the stronger modeled owned-compute option at the supplied prices. No deployment of 64 GPUs or fewer meets the 15% hurdle at these allowances. Do not buy extra GPUs merely to cross the threshold: negotiate customer pricing or like-for-like system costs and prove paid demand first.

Evaluated 912 configurations using corrected owner inputs. Reproduce: node tools/search-owner-deployments.mjs.

| Candidate | Initial funding | Total contributions incl. calls | Five-year net cash profit | Total five-year ROI | NPV at 15% | Payback |
|---|---:|---:|---:|---:|---:|---|
| 24 B300 GPUs / no dedicated reserve | $2,765,538 | $2,765,538 | $166,248 | 6.0% | -$731,991 | 60 |
| 60 saleable + 4 reserve B300 / 18 paid hours | $6,843,301 | $6,971,212 | $798,643 | 11.5% | -$1,510,418 | 56 |
| 60 saleable + 4 reserve B300 / 20 paid hours | $6,843,301 | $6,949,885 | $1,991,566 | 28.7% | -$673,702 | 49 |
| 72 B300 GPUs / no dedicated reserve | $7,658,853 | $7,773,897 | $3,310,968 | 42.6% | $7,361 | 45 |
| 108 saleable + 4 reserve B300 / 20 paid hours | $11,736,616 | $11,979,262 | $5,136,286 | 42.9% | $65,808 | 45 |

The 72-GPU case is the smallest count passing the hurdle at 20 paid hours/day and no dedicated reserve. Its approximately $7,361 NPV is less than 0.1% of total funding and fails either stress below. It is not a recommendation. With four B300 GPUs reserved, the first pass is 112 installed / 108 saleable. With a full reserve node, no configuration up to 128 GPUs passes. At 18 paid hours/day none of the searched configurations passes.

| Candidate | Required flat GPU-hour price for 15% hurdle (rounded up) | NPV with 10% annual price decline | NPV with $10,000 extra monthly operations |
|---|---:|---:|---:|
| 24 B300 GPUs / no dedicated reserve | $7.93 | -$1,233,285 | -$1,212,190 |
| 60 saleable + 4 reserve B300 / 18 paid hours | $7.81 | -$2,640,659 | -$1,990,480 |
| 60 saleable + 4 reserve B300 / 20 paid hours | $7.03 | -$1,929,820 | -$1,154,073 |
| 72 B300 GPUs / no dedicated reserve | $6.50 | -$1,500,166 | -$473,180 |
| 108 saleable + 4 reserve B300 / 20 paid hours | $6.48 | -$2,195,482 | -$414,733 |

Required prices preserve each case’s paid hours and all other costs. They are negotiation thresholds, not evidence of customer willingness to pay. At 60 saleable + 4 reserve and 20 paid hours, the approximately $7.024 calculated hurdle rounds UP to $7.03 for a cents-denominated quote. A genuine investment plan needs margin above the exact break-even hurdle.

For the 60+4 case at 20 hours and $6.50 rental pricing, lowering the eight-GPU system purchase price to approximately $604,471 reaches the 15% hurdle when acquisition contingency, maintenance, overhaul and reserve scale with hardware cost. At 56+8 reserve, that ceiling is approximately $550,215. These are like-for-like negotiation ceilings; no supplier has agreed to them.

Lowering assumed sales fees from 10% to 2% makes the 60+4 / 20-hour case marginally positive at approximately $70,046 NPV, but direct acquisition, support, payment and bad-debt costs must be verified. This is an alternative sensitivity, not an unannounced cost reduction in the base model.

A smaller 24-GPU deployment with no dedicated reserve needs about $7.93/GPU-hour at 20 paid hours/day, or roughly $479,852 per eight-GPU system at $6.50/hour. The base model currently prices these systems at $670,000. A customer-backed pilot may validate the market, but it should not be sold as already meeting investor return requirements.

## Assumptions and limits

- Owner inputs: $670,000 per eight-GPU B300 system and $6.50 per GPU-hour; $170,000 per eight-GPU RTX system and $1.50 per GPU-hour. The corrected $50 figure is excluded. Exact OEM quote scope remains unverified.
- Search includes 912 combinations: all mixes of 1–16 eight-GPU systems, 18/20 paid hours per saleable GPU/day, and zero/four/eight reserved GPUs per hardware family present. B300 and RTX reserve capacity is not interchangeable. More than 128 GPUs is outside this study, not proven infeasible.
- Five-year horizon, October 2026 start, no revenue in months 1–3. Entered paid hours apply every operating day from month 4; there is no further occupancy ramp. Flat rental prices are assumed unless explicitly stressed; 98% cash collection and 10% sales/platform fees are unverified allowances.
- The 15% annual project discount hurdle is assumed, not agreed investor terms. Project NPV ≥ 0 is the pass criterion. Total ROI is over FIVE YEARS, not annual. IRR is suppressed for contribution/distribution patterns with multiple sign changes.
- All equipment is purchased upfront. Site work: ($150,000 + $2,500 per equipment peak kW) × 1.20. Startup: $30,000 + 10% hardware acquisition contingency. Opening reserve: six months of starting operating costs. Month 37: 10% hardware overhaul; exit cost $40,000, zero resale value. Further capital calls remain possible.
- Monthly operations: $9,000 shared staffing/support/security/software/insurance/property allowance + $100/system + 3% of hardware/year for maintenance. Network $8,075/month and demand allowance $1,000 + $20 per equipment peak kW. All operating costs grow 3% annually. These are planning allowances, not complete quotes or a staffed 24/7 roster.
- Energy $0.07/kWh, PUE 1.4. B300 power allowance: 19.7 kW peak / 15 kW average per eight-GPU node. RTX eight-GPU allowance: 10 kW peak / 7 kW average, extrapolated from the earlier RTX planning envelope and not an OEM specification. Supporting IT adds 2 kW peak / 1 kW average. All reserve equipment retains purchase and power costs.
- Power agreement inclusions, exclusive continuous kW and service date are awaiting the team. The search does not certify that the site can support any candidate. Separate generation/storage costs, license/support scope, fabric/storage and engineering must be priced before procurement.
- Stress cases change one assumption at a time: 10% annual rental-price decline, or an additional $10,000/month operating budget escalating 3% annually with a revised opening reserve. No matched customer contracts, guaranteed utilization, tax benefits, property value or manufacturing/energy revenue are included.
- Smallest GPU count and maximum absolute profit are different objectives. Increasing quantity can mechanically raise modeled profit because shared costs are spread wider. A winner at a search boundary is not a universal optimum. Tiny positive NPVs are not robust investment recommendations.

## Practical decision

Use a B300-focused contract-first plan. Match procurement to minimum-paid customer commitments and OEM support terms. Confirm power capacity and cost coverage with the team. Negotiate a defensible rental-price/capex combination, then rerun downside cash flow and investor distribution terms. Do not present a fleet size alone as a promise of success.
