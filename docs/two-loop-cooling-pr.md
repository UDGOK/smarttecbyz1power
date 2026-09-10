The supplied cooling plan changes the concept from a large single chiller to separate warm-water and chilled-water circuits. Investors and customers need a clear explanation that distinguishes proposed architecture from installed capacity.

This PR adds a responsive thermal section on Power and a Cooling chapter in the existing protected investor viewer. The chapter uses a new schematic GLB model and matching still preview. Dry coolers, trim and scroll chillers, CDUs, buffer tank, rear doors, pumps and a generator docking pad are shown by category. Equipment is not placed on the satellite map because approved locations are pending.

Public wording qualifies water use, redundancy and operating targets. Vendor maxima, compressor hours, heat-share assumptions and speculative capacity are not presented as site performance. Shared branding and investor authentication are retained; the contact CTA uses the existing inquiry form.

Review `docs/two-loop-cooling-review.md` for source checks, files and the owner's pre-merge checklist. This is design intent, not a stamped mechanical design. Keep this PR in draft until the required owner/engineering review is complete.

Validation: Vercel build, 154 generated public-page checks, and 31 targeted architecture/authentication/viewer/menu tests passed. Browser/WebGL preview review remains outstanding. New asset routes reject anonymous access and retain private no-store responses.
