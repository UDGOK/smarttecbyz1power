/**
 * Live news brief.
 *
 * A Vercel serverless function, because the publishers' feeds carry no CORS
 * headers — a browser cannot read them directly, so something server-side has
 * to. It holds no key and no secret: these are public feeds, and this exists
 * only to cross the origin boundary and normalise the XML.
 *
 * Cached at the edge for fifteen minutes and served stale for an hour while it
 * revalidates, so a burst of visitors is one fetch to each publication rather
 * than one per reader. The page it feeds ships a build-time snapshot, so if
 * this is slow, rate-limited or down, nobody sees an empty page.
 */
import { collect } from './_feeds.mjs';

export default async function handler(req, res) {
  try {
    const data = await collect(60);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=3600');
    // Same-origin in practice; permissive because the payload is public
    // material that is already published elsewhere.
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).send(JSON.stringify(data));
  } catch (err) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(502).send(JSON.stringify({ error: 'feeds unavailable', items: [] }));
  }
}
