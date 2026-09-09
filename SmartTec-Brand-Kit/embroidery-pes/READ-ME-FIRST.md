# SmartTec PES — earlier fill trials

**Latest edition:** use [`refined-satin/START-HERE.html`](refined-satin/START-HERE.html) for the refined satin wordmarks at 3 and 3.25 inches and the S monogram at 2.5 inches. The files described below are retained as earlier basic-fill trials.

For polos and jackets, supplied at **3 inches (76.2 mm)** and **3.25 inches (82.55 mm)** wide with proportional height. These are real PES version 6 stitch programs, digitally reopened and checked. **They have not been sewn on fabric and are draft digitizations for a test sew-out, not approved production masters.**

Measured stitch bounds: 3-inch designs are **76.2 × 12.8 mm** (about 3 × 0.50 inches); 3.25-inch designs are **82.6 × 13.8 mm** (about 3.25 × 0.54 inches). PES coordinates round to 0.1 mm.

## Choose a file

- `3in` or `3p25in` selects the finished design width. Use the matching size directly; do not resize stitch data in the machine.
- `dark-fabric` uses an off-white body followed by the signal-green core.
- `light-fabric` uses a forest-green body followed by the signal-green core.
- Each PES has an accompanying stitch-path SVG preview. These depict stitch travel, not a photograph or simulation of finished fabric.
- `stitch-validation.json` gives measured dimensions, stitch counts, decoded trim counts, and colors for every file.

The SmartTec wordmark omits the tiny “by Z1Power” endorsement to retain readability at chest-logo size. The full endorsed artwork remains in `../logos/eps/` for posters and stickers.

## Digitizing baseline

A horizontal fill at 0.4 mm row spacing, inset sparse underlay at 1.2 mm spacing, boundary running stitches, and stitches up to 2.5 mm before file rounding. Routing stays within each connected shape; separate components use jumps and trims. Short securing stitches are included. No fabric-specific pull compensation is applied. This is a geometric fill draft; a digitizer may replace narrow areas with satin stitches and refine routing after a sew-out.

Both color versions share stitch geometry. They are not independently tuned polo and jacket programs. The embroidery shop should check the actual knit or woven fabric, stabilizer, needle, thread weight, tension, pull compensation, trim behavior, and hoop clearance. Confirm PES v6 support on the chosen machine. Check letter counters, gaps, coverage, puckering, and the green core on an actual sample before a garment run.

## Color order

1. Body: off-white `#EEF1EF` on dark garments, or forest `#1C4839` on light garments.
2. Core: signal green `#7BE88A`.

These are visual RGB targets, not manufacturer thread numbers. Match physical thread swatches. PES color display can vary across software.

## Posters and stickers

Use the EPS or SVG artwork, not PES. EPS files are true vector RGB artwork with scalable dimensions. Your printer should set final dimensions, color conversion, bleed, and any sticker cut contour. A production cut line is not supplied because no sticker shape or print specification was provided.

## Reproducibility and references

Source: `../source/export-embroidery.py`. Dependencies are listed in `../source/requirements-embroidery.txt`.

File encoding/decoding uses [pyembroidery](https://github.com/EmbroidePy/pyembroidery). General fill and underlay concepts are described in the [Ink/Stitch fill documentation](https://inkstitch.org/docs/stitches/fill-stitch/). Those tools and documents do not certify this design's sew-out quality.
