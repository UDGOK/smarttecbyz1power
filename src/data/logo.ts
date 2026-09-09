/**
 * The SmartTec symbol, inline.
 *
 * From SmartTec-Brand-Kit/source/logo-geometry.json — the designer's own
 * traced geometry, not a redrawing. The kit ships the symbol as a 14KB SVG
 * because every variant carries the whole wordmark and crops it with a
 * clipPath; these are the same curves with the subpaths outside the 204x215
 * icon window dropped. Identical shape, a tenth of the weight.
 *
 * Two paths, because the mark is two colours: the letterform and the green
 * core. Keeping them apart is what lets the letterform ride currentColor and
 * invert with the stage chrome while the core holds brand green — the kit's
 * own offwhite-green and forest-green variants differ in exactly that one
 * value (#eef1ef on dark, #1c4839 on light, #7be88a in both).
 *
 * Regenerate from the kit if the geometry is ever reissued.
 */
export const SYMBOL_VIEWBOX = '0 0 204 215';

/** The letterform. Filled with currentColor so it inverts with the chrome. */
export const SYMBOL_LETTER =
  'M48 7C48 7 167 6.83 191 7C191.47 7 191.99 7.53 192 8C192.17 16.67 192 59 192 59L82 59L82 60C82 60 76.97 60.59 75 62C72.67 63.67 68.86 66.56 68 70C66.67 75.33 67.83 88.67 67 94C66.54 96.95 64.33 100.33 63 102C62.07 103.16 60.33 103.67 59 104C57.71 104.32 55 104 55 104L55 105L18 105L18 104C18 104 15.19 104.6 14 104C12.33 103.17 9.17 100.83 8 99C6.91 97.29 7 93 7 93L6 93L6 47L7 47L7 41L8 41C8 41 8.32 36.91 9 35C9.83 32.67 12 28.5 13 27C13.41 26.38 15 26 15 26C15 26 14.59 24.53 15 24C16.17 22.5 19.67 18.67 22 17C24.07 15.52 27.33 15 29 14C30.21 13.27 30.71 11.57 32 11C33.5 10.33 36.5 10.5 38 10C39.14 9.62 39.82 8.24 41 8C42.67 7.67 48 8 48 8L48 7Z M152 113C159.83 112.33 191 113 191 113L191 114C191 114 194.63 114 196 115C197.83 116.33 201 120.33 202 122C202.51 122.86 202 125 202 125L203 125L203 173L202 173C202 173 201.8 178.43 201 181C200.17 183.67 198.89 186.69 197 189C194 192.67 186.67 200 183 203C180.69 204.89 176.83 206.33 175 207C174.06 207.34 172 207 172 207L172 208L168 208L168 209L6 209L6 156L126 156L126 155C126 155 130.83 154.5 132 154C132.69 153.71 133 152 133 152L135 152C135 152 136.33 148.83 137 148C137.47 147.42 138.67 147.67 139 147C139.5 146 140 142 140 142L141 142L142 120L144 119L144 117C144 117 149.03 113.25 152 113Z';

/** The core. Brand signal green in every colour variant. */
export const SYMBOL_CORE =
  'M77 89L141 89C141 89 141.17 115.33 141 121C140.98 121.75 140.47 122.42 140 123C139.33 123.83 138.26 125.37 137 126C135.67 126.67 132 127 132 127L132 128L66 128L67 96C67 96 68.55 95.6 69 95C69.5 94.33 69.11 92.56 70 92C71.33 91.17 77 90 77 90L77 89Z';

/** Brand palette, verbatim from the kit's README. */
export const BRAND = {
  forest: '#1c4839',
  signal: '#7be88a',
  offwhite: '#eef1ef',
  ink: '#141414',
} as const;
