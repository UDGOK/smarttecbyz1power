# SmartTec refined satin — test sew-out edition

Use this folder for the latest embroidery draft. It supersedes the basic horizontal-fill trials in the parent folder.

Six PES v6 files are included: 3-inch and 3.25-inch SmartTec wordmarks, and a standalone 2.5-inch architectural S monogram, each in light- and dark-fabric colors. Open **START-HERE.html** to view and download them. The small “by Z1Power” endorsement is omitted from garment wordmarks.

**These are refined digital stitch programs, not physically tested production masters. Have the shop sew and adjust a sample on the intended polo and jacket fabrics before production.**

## Finish and construction

- Letter strokes use alternating-rail satin with directions chosen for stems, arms, bowls and crossbars. Direction changes in the S use diagonal joins.
- The much larger 2.5-inch S uses staggered split satin in its broad strokes. Long spans are divided at changing positions; it is not uninterrupted satin across those wide areas.
- Center running stitches, inset edge running stitches and sparse zigzag underlay support the cover layer.
- Top satin has approximately 0.4 mm between successive penetrations on the same edge (0.2 mm between alternating edges). This is a starting setting, not a fabric-specific density prescription.
- A 0.12 mm baseline expansion supports coverage and modest pull compensation; overall horizontal limits retain the nominal artwork width. This expands internal section joins too, so the shop should check for excess buildup there.
- Securing stitches and trims separate columns. The shop can optimize the relatively frequent wordmark trims after reviewing machine behavior and routing.
- The nominal artwork retains its proportions. Compensation and PES coordinate rounding affect the encoded stitch envelope slightly.

## Sizes and colors

| Design | Nominal artwork size | Encoded stitch envelope | Stitch count |
| --- | --- | --- | --- |
| Wordmark, 3 inches | 76.2 × 12.76 mm | 76.2 × 13.0 mm | 2,367 |
| Wordmark, 3.25 inches | 82.55 × 13.82 mm | 82.6 × 14.0 mm | 2,525 |
| S monogram, 2.5 inches | 63.5 × 65.14 mm | 63.6 × 65.4 mm | 5,533 |

Each size is digitized independently. Select the correct file instead of scaling the PES on the machine. Monogram nominal height is approximately 2.56 inches.

Thread order is body first, then the signal-green core:

- Dark fabric: off-white `#EEF1EF`, then green `#7BE88A`.
- Light fabric: forest `#1C4839`, then green `#7BE88A`.

RGB values are appearance targets, not thread manufacturer numbers. Match physical thread swatches. No separate polo-knit and jacket-fabric compensation profiles have been approved.

## Shop sample review

Check fabric and stabilizer, needle and thread weight, tension, hoop clearance and PES v6 compatibility. Review smooth edges, even coverage, the openings in letters, the green core gap, diagonal joins, puckering, thread breaks and snag-prone spans. Adjust underlay, density, compensation and split settings as needed. Keep the silhouette and proportions; target a full, smooth flat-embroidery finish. These are not 3D foam programs.

## Validation and previews

Every PES was reopened and checked for dimensions, two thread colors, one color change, an end command, maximum stitch length (approximately 6 mm after rounding), and stitch travel within the compensated artwork. Detailed results are in `stitch-validation.json`. The comparison uses a 0.24 mm envelope to allow the 0.12 mm compensation, curve simplification and file rounding.

The PNG/SVG previews display decoded stitch paths, including underlay; they are not photographs or predictions of the sewn surface. Some underlay lines visible in these diagrams will be covered by the top stitches on fabric.

Source: `../../source/export-refined-satin.py` with `../../source/logo-geometry.json`; dependencies are listed in `../../source/requirements-embroidery.txt`. `construction.json` records the section directions and split counts. File encoding and decoding use [pyembroidery](https://github.com/EmbroidePy/pyembroidery). Satin, underlay and split-stitch concepts are documented by [Ink/Stitch](https://inkstitch.org/docs/stitches/satin-column/).
