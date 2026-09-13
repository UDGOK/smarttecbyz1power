# Public content consistency — 13 September 2026

## Scope and source of truth

Updated public site copy to match the owner's current launch and service plan. Financial scenarios remain in the protected investor area, where the current versioned investor model is maintained separately. This change does not establish that equipment is purchased, services are commissioned, customer contracts are signed or development targets have been achieved.

Public claims now consistently distinguish:

- **Launch:** grid power first. Solar and BESS are a separate later investment; neither their savings nor backup performance establishes launch economics or readiness.
- **Fleet proposal:** eight complete Supermicro systems, eight B300 GPUs per system, 64 GPUs in total, together in one building. 60 modeled saleable GPUs and four held back are a financial allocation, not an eight-GPU standby node, validated failover or a settled tenant layout.
- **Hardware ownership:** SmartTec intends to procure, own and operate its hosted hardware; the site does not represent a purchased or operating fleet.
- **Services:** planned shared inference capacity on nodes serving multiple tenants; dedicated GPU servers intended for a single tenant per node; colocation for customer-owned equipment. The first two are service modes for SmartTec-owned hosting, not additional independent fleets or a fourth product. Scheduling, isolation, support and access require a defined and validated service design.
- **Commercial stage:** active customer discussions; no signed customer contracts or guaranteed receipts established.
- **Site rights:** BC LLC is the management-reported related-party landowner. SmartTec's signed 50-year site-use agreement is management-reported and subject to document/title review.
- **Capacity:** gross building area, reported shared service current and preliminary land layouts do not certify usable IT capacity, rentable white space, generation capacity or service availability.

## Route inventory

| Route | Review and changes |
|---|---|
| `/` | Grid-first metadata and power chapter; future hybrid visuals qualified. Removed the legacy RTX configurator UI and boot import. Added a responsive three-service overview in the existing green theme, with links to the relevant planned service and workload brief. |
| `/site` | Grid-first launch, later energy investment, transformer/service-current distinction, reported building status, site rights and unconfirmed service date. Existing building/acreage facts retain their scope. |
| `/power` | Replaced the sub-7-cent solar/gas-led launch story with grid tariff/allocation review and later solar/BESS economics. Removed the unvalidated public storage power rating and headline solar acreage as a capacity proxy. Replaced the former direct-liquid requirement and two-liquid-loop story with the air-cooled server / room-in-row budgeting basis; exact OEM SKU remains pending. |
| `/compute` | Added the three service descriptions, multi-tenant versus dedicated-node distinction and planned SmartTec hardware ownership. Clarified 60+4 financial allocation. Removed references to the retired RTX estimator and directed financial scenarios to the protected area. |
| `/colocation` | Distinguishes customer-owned colocation from planned SmartTec-owned server hosting; links to shared inference and dedicated GPU services. Grid-first power and commissioning qualifications are explicit. |
| `/model-planner` | Replaced numerical reference outputs and dynamic model-sizing UI with a qualitative workload brief: model/application, performance, data/access, ownership, operational responsibilities and commercial scope. Original route and `#planner` anchor remain. No public ROI, pricing or capacity calculator is rendered. |
| `/about` | Updated service mix, grid-first roadmap, proposed fleet status and management-reported site rights. Team, emails, profiles, animations and credential badge components preserved. |
| `/contact` | Added the shared inference inquiry category while preserving dedicated/colocation values, delivery handling and contact details. Describes planned services and grid-first development. |
| `/news` | Reviewed; no SmartTec operating/return claim required editing. News snapshot data was not edited. |
| `/brand` | Reviewed; brand studio functionality and artwork data were not edited. Brand previews are identity assets, not evidence of a commissioned fleet. |
| Sitemap | Route set unchanged. |

Shared updates: `src/data/site.ts`, `page-experiences.ts`, `cinematic.ts`, `SiteFooter.astro`, `ThermalArchitecture.astro` and menu notes. New `ServiceOverview.astro` supplies homepage service cards. The cinematic narrative for `/investors` also now points to the current protected model rather than an earlier financial baseline; protected page/components were not edited by this public-content pass.

## Retired public tools

`Configurator.astro`, the historical configurator data/library and model-planner calculation libraries remain source-only historical code. The homepage no longer imports/renders the configurator, `boot.ts` no longer imports/initializes it, and `/model-planner` no longer imports/runs the numerical planner. These libraries are not a second public investment model. Removal of their source files and unit fixtures is optional future cleanup, not part of this content change.

## Dates and unresolved dependencies

- Removed Q4 2026 as the current public first-service target. Availability now follows procurement and commissioning, with exact delivery dates to be established. The earlier target remains explicitly historical in the internal public-record note.
- Construction (24 September) and utility commissioning (8 October) remain labeled management targets supplied 10 September, and fiber delivery remains a dated management estimate. These require revalidation; no commissioning or carrier acceptance evidence was added. Six months in a financial model is a scenario input, not an approved project schedule.
- Grid tariff, demand charges, continuous allocation, existing loads, electrical protection and transformer nameplate require utility/electrical evidence.
- Supplier configuration, cooling type and supported temperatures, complete installed cooling/electrical scope, rack load, warranties, support and acceptance remain engineering/supplier dependencies. The public schematic now describes an air-cooled server / room-in-row budget basis. Two nominal 50-ton plant units and five 40 kW terminal units are labeled budget placeholders, not installed capacity or proof of N+1 service. Exact OEM SKU confirmation may change the design and budget.
- Tenant allocation across complete eight-GPU nodes, isolation, workload performance, incident response, SLAs and node failure recovery remain to be designed and validated.
- Customer contracts, funding evidence, site-use documentation and investor terms remain diligence dependencies.
- Existing artistic scenes remain clearly identified as illustrative. They do not establish equipment counts, installed assets, battery backup or a surveyed layout.

## Verification

- `npm run check`: passed after implementation and after the cooling/test updates.
- 49 public interaction/library tests passed: public scenes, shared menu, cinematic entry, brand library and journey cue.
- `git diff --check`: passed.
- Updated generated-public QA to assert the retired numerical UIs are absent, all three services and hardware-ownership distinctions appear, inquiry categories exist and superseded launch/cooling claims do not return. Existing route and primary-anchor checks are retained.
- Source scan confirmed no remaining sub-7-cent or behind-the-meter-first launch claims in served public pages/shared narrative.
- Preserved existing route anchors, contact submission handling, team/credential components and unrelated dirty `src/data/brand-kit.json` and `src/data/news.json` edits.
- The final coordinated build passed 158 generated-route checks and 503 public/link/download checks. The parent audit also passed 213 unit tests on Node 24.19 and 22 public browser visits with no page errors, failed requests, overflow or broken images.
- The final Node 24.19 / Chrome compiled-server harness passed 177 HTTP and browser checks, including private model/authentication controls, all 13 presentation chapters, H.264 films, opt-in audio, native fullscreen, desktop/mobile PDF rendering, separate-tab opening, exact download and session recovery. Its local TLS Redis fixture is not a live Upstash/Vercel deployment test.
- The investor mobile capital table now displays complete amount cells without horizontal scrolling; wider scenario tables have a visible horizontal-scroll cue. Both regressions passed browser assertions and fresh screenshots were inspected.
- Public pages have a regression test that evaluates the investor client against their DOM and asserts no investor bootstrap request. This protects the shared-bundle initialization guard.
- This pass has not independently claimed a production deploy.

## Carrier scope and floor-area follow-up

Removed the historical $8,075/month carrier option, its 60-month term and derived totals from the shared public record. The v6.1 investor model carries a separate $4,000/month internet allowance; that allowance is not proof that the earlier carrier option or any specified speed has been purchased. Public copy now presents only the unconfirmed technical option and separates external internet from server interfaces and internal GPU fabric.

The model's 1,800 sq ft allocation does not fit within Building A's reported 1,500 gross sq ft even before usable-area deductions. Removed the implied A-or-C full-fleet option from public copy and the thermal diagram. The full-fleet location requires a measured layout, structural/access review and cooling/electrical fit-out design. Building C's larger gross area is not, by itself, fit-out approval.

SmartTec-owned hosting is the ownership category for shared inference and dedicated GPU servers. It is not modeled as a fourth independent product or additive revenue source. Public service lists and inquiry choices now use the same three categories as the protected narrative.
