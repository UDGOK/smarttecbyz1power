# SmartTec investor and website consistency report

Review date: 13 September 2026. Financial basis: model v6.1. All amounts are USD.

The refreshed site, protected investor room, immersive presentation and 26-page PDF now use the same financial basis and describe the same proposed business. SmartTec plans to own and operate a B300 fleet for shared inference and dedicated GPU customers, begin on grid power, and evaluate solar and battery storage separately. Customer-owned colocation is a distinct service whose revenue is excluded from this ownership model.

The arithmetic and presentation support a conditional investment discussion. They do not establish that the project is currently investable: the unsigned Base case remains below the 15% hurdle, and the stronger contract cases depend on commercial terms that are not signed.

**Prepublication sign-off: PASS.** The checked model arithmetic, published-content consistency and tested software behavior passed the release checks below. Production deployment and live verification are recorded in the delivery receipt for this release; they are not inferred from a local build.

## 1. One financial basis

The original private workbook was not changed or published. Its extracted, reviewed scenario record is `src/data/investor-model-v6-1.json`. Served financial copy, the FAQ, downloadable scenario snapshot, immersive pitch and PDF consume that record instead of calculating separate illustrative returns.

| Scenario | Initial capital | Hold | Dated funded project XIRR | Dated NPV at 15% | Funded cash multiple |
| --- | ---: | ---: | ---: | ---: | ---: |
| Base merchant plan | $6,934,754.57 | 5 years | -3.12% | -$3,089,279 | 0.893x |
| 60 GPUs at $7.50/GPU-hour, 36 service months | $7,030,329.29 | 5 years | 13.51% | -$257,057 | 1.458x |
| 60 GPUs at $7.50/GPU-hour, 60 service months | $7,030,329.29 | 6 years | 21.25% | $1,330,611 | 1.947x |
| 60 GPUs at $6.50/GPU-hour, 60 service months | $6,986,792.69 | 6 years | 16.05% | $215,134 | 1.693x |
| 12-month launch delay | $7,011,274.20 | 5 years | -5.71% | -$3,741,310 | 0.793x |
| Maximum build, Base merchant assumptions | $25,155,237.27 | 5 years | 0.27% | -$9,224,016 | 1.010x |

Capital is displayed to cents; return rates, NPV and multiples are rounded only for presentation. The dataset retains source precision. These are unlevered project returns before any investor ownership allocation, preference or distribution waterfall. Cash multiples and XIRRs include modeled asset resale and reserve release.

All contracted cases are hypothetical and unsigned. They assume 60 contracted GPUs, 95% paid share, 2% contract fees and no renewal. The contracted preset's merchant fallback is a $7.50 initial reference with 10% annual price decline, 50% utilization and 6.6% merchant fees; the $6.50 contract sensitivity retains that fallback. Sixty service months run from model month 7 through 66, within a six-year hold ending after month 72.

Base assumes six build months, a $6.50 initial GPU-hour reference, 10% annual rate decline, 55% first-year paid utilization and 70% thereafter. Year-2 revenue is $2,152,332, operating expense $778,334.05, EBITDA $1,373,997.95 and operating cash $1,362,596.84. Positive EBITDA does not recover the initial investment within the Base operating horizon.

The primary metrics use the dated funded-cash schedule, including final receivables collected after disposal. Annual operating cash, funded distributions, receivables, reserve movements and disposal proceeds remain distinct. Net asset exit combines gross resale with the signed negative disposal-tax cash flow. The workbook's alternate annual headline IRR is labeled separately wherever retained.

## 2. Consistent operating and ownership story

| Topic | Current presentation |
| --- | --- |
| Planned services | Shared AI inference is multi-tenant capacity on SmartTec-owned equipment. Dedicated GPU servers are single-tenant server capacity on the same owned fleet. They do not create two additive fleets or duplicate GPU-hour revenue. |
| Colocation | Customer-owned equipment with separate facility services and commercial terms. No colocation revenue is included in the B300 ownership cases. |
| Phase 1 fleet | Eight complete eight-GPU Supermicro systems: 64 installed GPUs, 60 modeled saleable and four held back. Purchase, exact SKU, support and delivery remain subject to evidence. |
| Availability | Four held-back GPUs are not a complete eight-GPU standby node. A failed node leaves 56 working installed GPUs; maintaining a 60-GPU commitment requires a defined recovery plan. |
| Launch power | Grid first. Planning inputs are $0.095/kWh energy plus $12/kW-month demand charges, with billed demand at 90% of modeled design-day load. No sub-7-cent or solar savings assumption supports the Base return. |
| Future energy | Solar and BESS require a separate scope, capital budget and tariff/dispatch investment case. Their savings, incentives and backup performance are excluded from the six GPU cases. |
| Preliminary cooling | Air-cooled servers and new room/in-row cooling: 128.4 kW modeled IT load, approximately 203.2 kW design-day facility load, two 50-ton chillers and five 40-kW in-row units. Counts are planning quantities, not approved or installed capacity. |
| Site rights | Management reports BC LLC owns the paid-off property and has a signed 50-year site-use commitment with SmartTec. The annual 1% payment is modeled on positive after-tax accounting income; agreement wording and related-party rights require review. Land value is not counted as SmartTec cash equity. |
| Founder funding | Management reports $6 million available and willingness to cover the overage. Base modeled funding exceeds this amount by $934,754.57. Funds and binding contribution terms have not been independently verified. |
| Customer evidence | Active discussions, with no established signed customer contract or paid pilot. Marketplace discussions, potential offtakers and downstream token demand are not represented as guaranteed receipts. |
| Connectivity and support | Model connectivity begins at $4,000/month; bandwidth, route diversity and SLA scope are unconfirmed. Support assumes 36 operating months included, then 5% of complete-system purchase cost annually before 3% cost escalation. |

Gross building area and a shared electrical service rating are not usable IT capacity. The model's 1,800 sq ft allocation cannot simply be assigned to Building A's reported 1,500 gross sq ft. The earlier implied A-or-C full-fleet option was removed; measured layout, structural/access review and electrical/cooling design must establish the final building fit. A generator docking allowance does not establish an installed generator.

## 3. Reviewed touchpoints

| Touchpoint | Result and scope |
| --- | --- |
| `/` | Grid-first story, planned service overview and automatic cinematic entry; legacy RTX configurator removed from the served experience. |
| `/site` | Reported site rights, buildings, electrical service and development status distinguished from commissioned capacity. |
| `/power` | Grid energy and demand review at launch; later solar/BESS investment separated. Earlier direct-liquid launch requirement replaced with the current air-cooled/in-row planning basis. |
| `/compute` | Shared inference, dedicated GPU servers, planned hardware ownership and 60+4 financial allocation aligned. |
| `/colocation` | Customer-owned colocation separated from SmartTec-owned hosting and from modeled GPU revenue. |
| `/model-planner` | Qualitative workload and service brief replaces unvalidated numerical capacity/pricing outputs. Existing route and primary anchor retained. |
| `/about` | Company stage and operating plan aligned. Team names, contact emails, profile links and personal certification components retained. |
| `/contact` | Shared inference inquiry category added alongside dedicated and colocation inquiries; existing contact details and delivery handling retained. No new end-to-end email receipt test is claimed by this release report. |
| `/news` | Reviewed for company-claim consistency; attributed industry material remains external context. The final frozen-build browser review returned the page and its feed without failed responses. |
| `/brand` | Existing studio, asset previews and brand data preserved. Artistic imagery is not treated as installed equipment or an approved site design. |
| `/investors/login` | Public entry and presentation links remain discoverable; access does not expose the protected financial record. |
| `/investors` | Funding, scenarios, annual cash labels, service ownership, technical basis and evidence requirements use v6.1. Base downside and unsigned contract status are prominent. |
| `/investors/pitch` | Immersive narrative and financial cards use the same reviewed model and product boundaries. Existing protected motion/media experience retained. |
| `/investors/presentation` | Protected PDF reader and separate download use the same current presentation. Desktop/mobile reader, fullscreen, download integrity and session recovery passed local integration. |
| Investor FAQ and snapshot | Protected bootstrap/FAQ use current facts. Authenticated `GET`/`HEAD /api/investor/model` provides the reviewed JSON scenario snapshot, not the private workbook. |
| PDF and presentation media | Current 26-page PDF, stable filename alias and authenticated server payload are identical. Existing Runway imagery is identified as concept artwork where it could be mistaken for project evidence. |

The historical `underwriting-scenario`, `calculate`, `compare`, `price-floor` and `export` actions under `/api/investor/` now return HTTP 410 after authentication and applicable POST origin/CSRF checks. Visitors are directed to reviewed scenarios. Historical model libraries and fixtures may remain in source, but no longer provide a competing served calculator. This retirement includes the obsolete public RTX configurator and numerical workload planner.

## 4. Verification record

| Check | Result |
| --- | --- |
| Workbook arithmetic | Native Excel full recalculation, disposable-copy save/reopen and independent financial reconstruction passed. All 26,721 source formulas have cached values without cached errors. Six cases reconcile within the documented tolerances. |
| Automated tests | 213 tests passed under Node 24. The PDF-specific group passed 3/3. |
| TypeScript | `tsc --noEmit` passed. |
| Build outputs | Node and Vercel builds passed. |
| Generated public pages | 158 generated-route checks passed. |
| Public links/download QA | 503 QA checks passed across public content and 157 distinct internal links/downloads. |
| Desktop/mobile browser sweep | 22/22 visits passed on the frozen Node 24 build across ten public pages plus login, at 1440 px and 390 px: HTTP 200, no failed same-origin responses, JavaScript page errors, document overflow, broken images or placeholder matches. |
| Automatic entry | A normal-motion desktop run exited the entry experience automatically in approximately 4.72 seconds. This is an observed local run, not a cross-device latency guarantee. |
| PDF arithmetic and integrity | Canonical values, source hashes, output bytes, alias equality, protected payload, contacts and links passed verification. |
| PDF visual inspection | All 26 pages rendered with Poppler at 100 DPI (1600 x 900) and visually inspected. Changed pages were rerendered and checked. Text overlap, divider crossings and page overflow checks passed. |
| Independent PDF financial review | Capital, annual cash, dated returns, contract fallback and resale wording reviewed. Launch-delay labeling, support escalation and unconfirmed connectivity scope were corrected. |
| Protected browser integration | 177 local HTTP/browser checks passed on Node 24 and Chrome: all 13 slides, video, optional audio, mobile tables, fullscreen, PDF reader/download and session recovery. |
| Production release and live smoke test | Recorded in the release delivery receipt after publication; this report is the prepublication release gate. |

The final public browser evidence is `tmp/investor-v61-public-audit/report.json`; the sweep exited successfully. A prior run was invalidated by rebuilding files underneath the running local server. The final server was restarted on the frozen Node 24 build, and all 22 routes/viewports were repeated successfully. The mobile capital table now keeps amounts visible, and wider return tables provide a horizontal-swipe cue.

Protected-page review uses code, automated tests and isolated local integration. The user's private production investor session was not accessed, consistent with the earlier preference to review private pages through code and automated tests. Public browser checks and a local test session do not establish access to or review of private production account data.

Supporting records: `docs/model-v6-1-verification.md`, `docs/public-content-consistency-2026-09-13.md`, `tmp/v61-unit-node24.log`, coordinated build logs, `tmp/investor-v61-public-audit/report.json`, `tmp/v61-integration-test.log`, `tmp/pdfs/v6-1-qa.json`, and the 26 images in `tmp/pdfs/v6-1-render/`.

## 5. Artifact identity

| Artifact | Identity |
| --- | --- |
| Private workbook | `SmartTec_B300_Investor_Model_v6.1.xlsx`; 479,453 bytes |
| Workbook SHA-256 | `297c9fa394193d02871016b8f1d9b7586f1d62df4483efd7ea69acaedd421c4e` |
| Canonical JSON hash, normalized LF | `e934721da2670d972284a132db915d9d15fbedc06c8adf81bd14b29f503d56b3` |
| Dated presentation | `output/pdf/SmartTec-Investor-Presentation-2026-09.pdf` |
| Stable alias | `output/pdf/SmartTec-Investor-Presentation.pdf`; identical bytes |
| PDF size/pages | 1,606,298 bytes; 26 pages |
| PDF SHA-256 | `dc7794fa862cbb3589c347eca5da73a167a7db54f85d302a4860d7fa24824aa3` |
| Provenance manifest | `src/smarttec-investor/data/investor-deck.json` binds model, team, credential and generating-code hashes |

The workbook remains private. The investor PDF and reviewed scenario snapshot are served through the authenticated investor area; the original workbook is not bundled as a public download.

## 6. Meaning of sign-off and remaining investment evidence

This review signs off on the checked arithmetic, consistency of published content and tested software behavior, within the reviewed scope documented above. It does not certify an investment, promise a return or independently confirm the project's commercial, legal or engineering readiness.

Before reliance on a contracted return case, investors still need:

- Executed customer/offtaker terms, credit support, paid hours, service acceptance, cancellation rights and the customer's payment obligation independent of downstream resale.
- Evidence of founder funds, timing/form of contributions, overage support, and any outside funding obligations.
- Title and the operative BC LLC agreement, including profit definition, assignment/financing rights, related-party protections and treatment of improvements.
- Utility capacity, actual tariff/demand treatment, voltage conversion and available continuous allocation; a grid service nameplate alone does not establish these.
- Final hardware configuration, delivered scope, support/licensing, carrier bandwidth and route scope, installed cooling/electrical prices, permits and professional engineering/commissioning acceptance.
- A complete monthly liquidity forecast over the investment hold. The dated return schedule uses annual distributions and separate terminal collection; the launch schedule alone does not prove all intrayear cash needs.
- Supportable resale/buyback assumptions and agreed investor ownership, distribution waterfall, exit rights and financing terms.

The Base and 36-month contract cases remain below the modeled hurdle. The 60-month sensitivities show terms worth negotiating and verifying; they are not evidence those terms are available. Closing these evidence gaps is the next business milestone after a consistent, tested presentation.

## 7. Publication record

The source and updated PDF are published together to `UDGOK/smarttecbyz1power`. This report records the prepublication sign-off; it accompanies the implementation commit. GitHub's commit checks and Vercel deployment identify the production build. The task's final delivery receipt records the verified deployment commit and live route/access results after publication.

No unresolved numeric or wording conflict was found in the reviewed, served financial surfaces after the corrections above. Unverified commercial and engineering assumptions remain visibly qualified. This is a scoped QA conclusion, not a guarantee that all future browser behavior or business outcomes will be error-free.
