# Licensed fonts

The site currently renders with free stand-ins. Drop the licensed files into
**this directory**, using exactly these filenames, then rebuild. The type
becomes an exact match to the reference with no code change — every token
stack already names the licensed face first, and `src/layouts/Base.astro`
emits the `@font-face` rule for each file it finds here at build time.

The build-time check is deliberate: declaring the faces unconditionally would
404 three times on every page view for as long as the files were missing.
On Vercel, adding the files is a commit, which triggers a rebuild anyway.

| Filename to drop in | Face | Where to buy |
|---|---|---|
| `PPSupplyMono-Regular.otf` | PP Supply Mono | pangrampangram.com |
| `PPSupplySans-Regular.otf` | PP Supply Sans | pangrampangram.com |
| `STKBureau-SerifBook.otf` | STK Bureau Serif | the foundry that licenses Bureau Serif |

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

Until the licensed files land, these carry the display voice. Both are free
and chosen for contrast and register rather than name:

- **Bodoni Moda** stands in for STK Bureau Serif — high-contrast didone
- **Pinyon Script** stands in for the reference's formal script face

## Checking it worked

After dropping the files in, load any page and run in the console:

```js
document.fonts.check("16px 'PP Supply Mono'")     // true once loaded
document.fonts.check("16px 'STK Bureau Serif'")
```

Both returning `true` means the licensed faces are live and the stand-ins are
no longer being used.
