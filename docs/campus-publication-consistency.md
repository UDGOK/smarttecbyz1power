# Campus publication consistency

The owner approved the Blender campus experience for publication. The public destination is `/site/campus`. This publishes a proposed spatial concept; it does not establish an installed facility or revise the investor financial model.

## Current concept and retained budget

| Subject | Current public concept | Qualification retained beside the claim |
| --- | --- | --- |
| Compute | Eight complete Supermicro B300 systems across Buildings A and C | The illustrated four-plus-four split is subject to final allocation and measured fit-out. Exact SKU, procurement and commissioning remain open. |
| Cooling | Direct-to-chip liquid cooling; overhead supply and return to rack manifolds | CDUs separate facility water from server coolant. Residual room cooling, final equipment, routing and installed scope require design confirmation. |
| Heat rejection | Proposed chiller yard behind B | Closed-loop Daikin at 208V is owner intent, not an accepted model selection or evidence of voltage compatibility or usable capacity. |
| Fiber | Owner-reported Dobson handoff in B | External and internal routes, carrier service acceptance and diversity remain unverified. Existing service-option wording stays qualified. |
| Future energy | BESS inside B; solar on Tract 3 | Future BESS connects through PCS on a branch separate from the IT UPS. No islanding, runtime, savings or capacity guarantee is added. |
| Investor model | Published v6.1 scenarios remain the earlier air-cooled, one-building budget | The DLC campus concept needs updated equipment quotes, design and repricing. No model values, PDF or return calculations were changed by this content pass. |

## Shared copy and page changes

`src/data/site.ts` exports the following stable fields for page integration:

- `campusConcept.href`: `/site/campus`
- `campusConcept.allocationNote`: “Four systems in A and four in C are illustrated; final allocation and measured fit-out remain subject to design.”
- `campusConcept.budgetBasis`: “Published v6.1 financial scenarios retain the earlier air-cooled, one-building budgeting basis. The direct-liquid campus concept requires updated equipment quotes, design and repricing.”

The shared `publicDeployment.building`, `buildingNote` and `cooling` strings now describe the current concept. The HVAC, future BESS siting, solar tract and home-stage narrative follow the same arrangement. Network data adds `handoff`, `handoffNote` and `handoffEvidence`; it does not turn the reported location into commissioned service.

`src/pages/compute.astro` identifies A/C and DLC in its introduction and specifications, labels the illustrative allocation and earlier budget, and links to the full viewer.

`src/pages/power.astro` retains the `/power#thermal` anchor and replaces its use of the older `ThermalArchitecture` component with a concise current-concept section. The component file itself is unchanged. Power copy distinguishes future BESS/PCS from the UPS and links to the viewer.

## Completed integration — 13 September 2026

The full experience is published at `/site/campus`, with entry points on the home, site, compute, power, about and colocation pages and in the protected investor room. The site navigation and sitemap include the new route. The private survey remains protected; its historical BESS and solar/storage assignments are explicitly distinguished from the newer concept.

The compute and power visual stories, shared deployment copy, investor room, immersive pitch, facts register and PDF reader now make the same distinction between the current campus concept and the retained v6.1 financial basis. Canonical financial data, return calculations and PDF bytes are unchanged. The release does not claim that the new cooling specification is covered by the earlier equipment price or cooling allowance.

Sixteen rendered views are available before loading 3D. The default image is approximately 246 KB. The interactive model loads on request: approximately 17 MB compressed, compared with the approximately 120 MB source export. The optimized geometry retains the source's 1,401 nodes, 1,374 meshes, 61 materials and 2,129,918 triangles. The browser loads the HDR environment and Three.js only when 3D is requested. Rendering pauses when hidden or offscreen; reduced-motion preferences, fallback images and retry behavior are supported.

Only the reviewed web model, optimized WebP renders, generic environment lighting, systems graph and asset credits are published. The native Blender file, source survey, manufacturing drawings and original investor files are excluded from public assets. The two preexisting local brand-kit/news changes remain byte-for-byte intact and are excluded from this release commit.

## Pre-deployment validation

- TypeScript `tsc --noEmit`: passed.
- Automated unit/static suite: 217 tests passed, zero failures.
- Node and Vercel production builds: passed.
- Each build: 158 public-page checks and 505 QA checks across 10 public pages and 158 distinct internal links passed.
- Compiled-server investor HTTP suite: 116 checks passed, including access gates, protected assets, no-store behavior, CSP and PDF integrity.
- Production browser suite: all four grouped scenarios passed, including all 16 renders, deferred 3D loading, material uploads, tracing, cutaway and quality controls, reduced motion, offscreen pause, back navigation, context-loss fallback, load failure/retry and mobile layout.
- Visual review: desktop, an actual 390-pixel mobile viewport, the high-quality data-hall view, the site entry card and power-page cooling section reviewed. No blocking layout issue found.
- AST comparison against the Git baseline confirmed all 101 numeric literals in shared `site.ts` are unchanged.
- Public asset/source scan: no private source documents, local paths or native Blender download links.
- `git diff --check`: passed.

These checks support publication of the approved architectural concept. They do not certify construction drawings, electrical/cooling capacity, carrier service, or an investment return. Production deployment and live checks follow the release commit.

## Cooling references

The concept follows [Supermicro's B300 direct-to-chip system documentation](https://www.supermicro.com/en/products/system/gpu/4u/sys-422gs-nb3rt-lcc), its [B300 rack datasheet](https://www.supermicro.com/datasheet/datasheet_SuperCluster_B300_Front_IO.pdf), and [Vertiv's explanation of separate facility and secondary CDU circuits](https://www.vertiv.com/en-us/insights/articles/educational-articles/understanding-coolant-distribution-units-cdus-for-liquid-cooling/). These establish available topology, not this site's selected capacities, final pipe sizing or commissioned performance. The public viewer includes its design basis; detailed source-review notes remain in the local project archive.
