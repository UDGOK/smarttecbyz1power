# Final site and investor-material review — 11 September 2026

The final review corrected stale deployment descriptions, two calculator interactions and one PDF typography issue. The public site, private investor room, FAQ and presentation distinguish the earlier two-four-GPU-RTX/one-B300 starter concept from current B300 fleet alternatives. No final fleet or procurement approval is asserted.

## Corrections

- Updated the homepage, compute, campus, about, contact and colocation pages, shared footer/header, visual chapters, earlier RTX configurator and investor FAQ/journey. Owner-priced eight-GPU systems remain distinct from the earlier four-GPU RTX reference.
- JSON imports discard obsolete file-read and validation responses after newer edits or imports. A late response cannot clear a newer file-picker selection or show an obsolete validation error.
- Adding a revenue segment respects the equipment's operating start and the latest existing contract end, including unsorted imported segments.
- Corrected the energy slide's OG&E typography and generated the dated PDF edition. Its authenticated download, metadata and SHA-256 match. The older undated PDF remains a prior repository edition because a local viewer held it open; the website serves the dated edition.

## Verification before deployment

- TypeScript and 144 automated tests pass, including import concurrency and revenue-segment interaction regressions.
- Node and Vercel production builds pass. Each output passes 154 generated-page checks and 457 QA checks covering 10 public pages and 157 internal links/downloads.
- The compiled Node server passes 52 HTTP checks using a local TLS Redis fixture: private authentication, assets, PDF GET/HEAD, byte/hash matching and post-logout rejection. Private pages were reviewed through code and this local fixture, as requested; no live investor account was used.
- The PDF has 26 pages. Financial amounts, team names, contacts, links and structure pass checks. The changed page was rendered and visually inspected; other pages retain the previously reviewed layout and content. The investor presentation section renders at 1440px and 390px with all three images decoded and no horizontal overflow.
- Live pre-deployment Chrome review covered `/`, `/site`, `/power`, `/colocation`, `/compute`, `/model-planner`, `/news`, `/about`, `/contact`, `/brand` and `/investors/login` at 1440px and 390px. All 22 visits returned 200 with no JavaScript exceptions, failed same-origin responses, broken loaded images, horizontal overflow or placeholder markers. Normal-motion homepage entry completed automatically in approximately 5.2 seconds including navigation. Reduced-motion entry also completed.

## Financial and evidence limits

An independent arithmetic review agreed with the engine and presentation: the 60-saleable-plus-four-reserve, 20-paid-hours/day illustration requires $6,843,301 initially and approximately $6,949,885 across all modeled equity contributions. It produces approximately $1,991,566 net project profit, 28.7% total five-year ROI, month-49 sustained payback and negative $673,702 NPV at the assumed 15% annual hurdle. These are conditional model results, not audited results or guaranteed investment returns.

The owner-reported power agreement still needs continuous reserved kW, service date and complete fuel/maintenance/loss/replacement/equipment cost scope from the team. Paid customer commitments, complete OEM quotes, engineering acceptance and investment terms remain outstanding. These gaps are stated in the materials and cannot be resolved by visual or software QA.

Three independent agent reviews returned investor, technical and visual findings. Agent follow-up hit usage limits; the primary agent completed the fixes and regression checks. This is a simulated diligence exercise, not approval from actual investors. Browser checks cover the stated environments and routes; they do not prove that every device or future condition is error-free.

Deployment status and final live verification are reported with the release commit after the push. No investor messages, test inquiry submissions or investment commitments were made in this final pass.
