# Two-loop cooling review — 10 September 2026

## Outcome and deployment status

This change replaces the earlier single-AFC visualization direction with the owner's two-loop design intent. It adds the thermal section at `/power#thermal`, and a protected Cooling chapter in the existing investor campus viewer. The new assets are an explanatory equipment exhibit, not positions on the surveyed property. No new authentication mechanism or dependencies were introduced.

The owner's uploaded `smarttec-cooling-architecture-design-brief.md`, section 8, requires checks before merge. Submit as a **draft pull request**; do not merge this change to the production branch until the owner resolves that checklist. A Vercel preview can build without treating the physical design as approved. Do not claim a successful production deployment from a branch push.

## What was redrawn

- Loop A: liquid-cooled rack category, CDU isolation, two dry coolers and a smaller trim chiller.
- Loop B: active rear-door rack category, buffer tank and two air-cooled scroll chillers.
- Pump category indications, two circuit color pairs, and a generator docking pad/tap box, not a generator.
- Public responsive flow diagram. Supply arrows point from the outdoor plant toward the load; warmer return arrows point back to the plant. The CDU divides the server and facility fluid systems.
- All geometric sizes and spacing are illustrative. There are no kW capacities or installed counts on the 3D exhibit.

The main campus map is intentionally unchanged. Section 7 of the supplied brief explicitly says not to place equipment before the PE gives locations. Once approved coordinates and clearances exist, instantiate the model categories in the campus frame. Do not copy exhibit coordinates into the satellite overlay.

## Corrections to the supplied brief

| Statement | Treatment and reason |
|---|---|
| Zero water consumed / filled once / nothing drains | Public text says no evaporative water use during normal heat rejection is the design goal. Filling, service, leaks and eventual coolant replacement are not zero-water events. No lifetime water-use guarantee. |
| Every component N+1; two loops cannot fail together | N+1 remains a target. Confirm surviving capacity at peak conditions, shared power, pumps, controls, headers and isolation. One trim chiller is a single component when trim duty is essential; two visual chillers do not establish redundancy. |
| Compressor off most of the year / a few hundred hours | Removed as an operating promise until hourly weather, fluid temperatures, approach temperatures and load analysis support it. Dry-only hardware does not establish compressor hours. |
| Three-quarters of heat on Loop A | Removed. It depends on selected equipment, operating load and liquid-capture fraction, especially with the owner's mixed starter fleet. |
| 45°C supply, 98% capture | Verified as vendor capability claims for compatible selected systems, not the campus design point or all B300 products. CDU approach and fluid compatibility require selection. No unsupported numeric site cards. |
| 75 kW rear doors | Verified as a product-family maximum, not selected door capacity at the proposed fluid temperature, glycol concentration or airflow. No guaranteed rack capacity on the public section. |
| DGX B300 14.5 kW applied to liquid-cooled HGX B300 | These are different system references. Obtain the precise liquid-cooled OEM system selection and maximum electrical load; do not reuse an air-cooled DGX rating to certify the proposed DLC system. |
| No CRAH / no room cooling required | Rear doors target rack exhaust. Envelope, ventilation, humidity, dew point and other heat loads remain engineering questions. Do not delete environmental cooling before review. |
| Both circuits use identical propylene glycol | The server fluid must follow the OEM's material and water-quality requirements. The CDU isolates that fluid from the facility circuit. Do not prescribe a common percentage or chemistry without equipment approval. |
| Tier I with ride-through | No tier classification is introduced. Physical redundancy or batteries do not establish a certified tier. |
| 60–65°F / 110°F design day | Retained only as items for the PE to evaluate, not approved design conditions. Check condensation risk and selected equipment performance. |

## Source check

Reviewed 10 September 2026. Source capabilities do not verify this site's equipment selection or operating performance.

- [Supermicro DLC-2 announcement](https://www.supermicro.com/en/pressreleases/supermicros-dlc-2-next-generation-direct-liquid-cooling-solutions-aims-reduce-data): describes up to 45°C inlet and up to 98% liquid heat capture. The broader offering includes wet/hybrid options too, so this source alone does not establish dry-only site cooling.
- [Supermicro HGX B300 liquid-cooled systems](https://www.supermicro.com/en/pressreleases/supermicro-expands-nvidia-blackwell-portfolio-new-4u-and-2-ou-ocp-liquid-cooled): distinguishes 4U DLC-2 and OCP configurations. Their characteristics cannot be transferred to an unspecified B300 node.
- [Motivair ChilledDoor](https://www.motivaircorp.com/products/chilleddoor/): product page advertises up to 75 kW and room-neutral cooling. The selected unit's operating point still requires a vendor selection.
- [NVIDIA DGX B300 guide](https://docs.nvidia.com/dgx/dgxb300-user-guide/introduction-to-dgxb300.html): reference for DGX system requirements, not a substitute for the intended DLC OEM specification.

## Existing-site differences resolved

The uploaded brief describes Anybody, Space Mono, DM Sans and a gray/neon theme. The checked-in website actually uses its own shared Ratch/PP Supply font tokens and forest/signal-green palette. This change inherits the existing tokens and preserves the approved header/logo/menu. It introduces only the two diagram circuit color pairs as semantic accents.

The repository's existing inquiry form is FormSubmit, not Brevo. The CTA links to `/contact#reserve-enquiry` and reads “Discuss the cooling requirements.” No new lead service is configured and no nonexistent thermal spec-sheet download is promised. The new component adds no client JavaScript on the public page.

## Files and regeneration

| File | Purpose |
|---|---|
| `src/components/ThermalArchitecture.astro` | Public responsive thermal section and inline supply/return diagrams |
| `src/pages/power.astro` | Includes the section |
| `src/smarttec-architecture/chapters.mjs` | Cooling chapter metadata |
| `src/smarttec-architecture/campus-viewer.mjs` | Correct model-preview labels and category hover descriptions |
| `src/smarttec-architecture/server/thermal-assets.mjs` | Generated, server-only GLB and WebP assets |
| `src/smarttec-investor/server/handlers.mjs` | Serves both new assets only after authentication |
| `artifacts/cooling/two-loop-cooling.glb` | Blender / glTF importable equipment study |
| `artifacts/cooling/two-loop-preview.png` | Still preview of the same geometry |
| `artifacts/cooling/two-loop-scene.json` | Geometry and non-location metadata |
| `tools/generate-cooling-model.py` / `tools/cooling_mesh.py` | Reproducible mesh, preview and protected-asset generation |

To regenerate: use Python 3 with Pillow and run `python3 tools/generate-cooling-model.py` from the repository. The script does not run in production or during ordinary builds. GLB units are meters, Y-up, with illustrative envelopes only. Import through Blender's glTF 2.0 importer. Do not upload the private source models to `public/` for convenience; the authenticated endpoint paths are `/api/investor/thermal-model` and `/api/investor/thermal-preview`.

## Review before merging

1. Owner accepts the revised, qualified copy and verifies service information.
2. PE/vendor review confirms the intended system variants, fluid requirements, load split, redundancy and environmental control strategy.
3. No signed design or stamped status is claimed by this PR. “Review pending” must remain accurate.
4. Validate the preview with the investor sign-in, Cooling chapter, image/3D mode switching, touch/keyboard navigation, and the public inquiry link.
5. Obtain PE locations before any physical map placement. That is a later map change, not a hidden assumption in this one.

## GitHub handoff

Validation completed: Vercel production build succeeded; 154 generated public-page checks passed; 31 targeted architecture, authentication, viewer-state and shared-menu tests passed. Both GLB and preview endpoints were tested for anonymous rejection and authenticated, non-cached access. The geometry preview was visually inspected. Browser rendering and hardware-accelerated interaction still require preview review; these checks are not a site commissioning or mechanical validation.

Branch: `codex/two-loop-cooling-review`. Base: `main`. Push this branch and open a draft pull request. Production remains on main until an authorized merge. If Codex has already supplied a PR link, use that PR and do not run a second publisher or recreate the branch. Review Vercel's status and preview on the PR; a configured preview may require separate Vercel access.

Local fallback from this repository after signing into GitHub with write access:

```sh
git switch codex/two-loop-cooling-review
git push -u origin codex/two-loop-cooling-review
gh pr create --draft --base main --head codex/two-loop-cooling-review --title "Add reviewed two-loop cooling architecture" --body-file docs/two-loop-cooling-pr.md
```

These commands publish a review branch, not a merge. Do not place access tokens in files or send them in chat.
