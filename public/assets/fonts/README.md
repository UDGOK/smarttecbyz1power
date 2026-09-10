# Licensed fonts

The site currently renders with free stand-ins. Drop the licensed files into
**this directory**, using exactly these filenames, then rebuild. The type
becomes an exact match to the reference with no code change — every token
stack already names the licensed face first, and the shared `src/components/SiteFonts.astro`
emits the `@font-face` rule for each file it finds here at build time.

The build-time check is deliberate: declaring the faces unconditionally would
404 three times on every page view for as long as the files were missing.
On Vercel, adding the files is a commit, which triggers a rebuild anyway.

| Filename to drop in | Face | Where to buy |
|---|---|---|
| `Ratch-Variable.woff2` | **Ratch** — the primary face | youworkforthem.com/font/T29210/ratch |
| `Ratch-Regular.woff2` / `-Medium` / `-Bold` | Ratch static cuts, if the licence has no variable file | as above |
| `PPSupplyMono-Regular.otf` | PP Supply Mono | pangrampangram.com |
| `PPSupplySans-Regular.otf` | PP Supply Sans | pangrampangram.com |
| `STKBureau-SerifBook.otf` | STK Bureau Serif | the foundry that licenses Bureau Serif |

**Ratch is the one that matters most.** It is now first in both the display
and the body stack, so dropping it in changes the whole site's voice. It is a
variable geometric grotesk in seven weights (Thin to Black) by Roman
Melikhov. Convert whatever the licence ships to `.woff2` — a variable file
alone is enough, and is preferred; the static entries are only there in case
the licence has no variable cut.

Buy a **web** licence, not just desktop — a desktop licence does not cover
serving the file from a website. Web licences are usually sold by monthly
pageview band.

## What is already exact

These five are the faces the reference itself loads from Google Fonts. They
are free, and the site loads the same families at the same weights, so they
already match:

- Google Sans Code (400, 700) — UI micro-labels
- Google Sans Flex (400, 500, 600) — sans
- Inter (400, 500, 600) — sans fallback
- Newsreader (400, 500, italic 400) — editorial serif
- Caveat (700) — handwritten annotation

## What the stand-ins are

Until the licensed files land, these carry the voice. All free, and chosen by
genre rather than by name:

- **Space Grotesk** stands in for Ratch — the closest free geometric grotesk,
  and the reason the site currently reads as a grotesk rather than a didone
- **Bodoni Moda** is kept on `--f-didone` for editorial moments only
- **Pinyon Script** stands in for the reference's formal script face

## Checking it worked

After dropping the files in, load any page and run in the console:

```js
document.fonts.check("16px Ratch")                // the important one
document.fonts.check("16px 'PP Supply Mono'")
document.fonts.check("16px 'STK Bureau Serif'")
```

Both returning `true` means the licensed faces are live and the stand-ins are
no longer being used.


## Shared public and investor typography

`Base.astro` and the private investor layout both render `SiteFonts.astro`.
Space Grotesk (400–700) is served from the existing `/investor-assets/` font
files; Google Sans Code (400, 700) is now served locally from this directory.
This keeps private pages within their same-origin font CSP. Ratch and PP
Supply files, if licensed and added, are picked up by both layouts together.
The homepage retains its existing Google-hosted editorial families and
Space Grotesk 300. Do not add an external font service to the private layout.

Google Sans Code source: Google Fonts CSS API, retrieved 10 September 2026;
upstream https://github.com/googlefonts/googlesans-code.
`GoogleSansCode-OFL.txt` accompanies the unchanged font files.
