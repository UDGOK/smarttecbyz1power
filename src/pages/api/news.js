/**
 * Live news brief.
 *
 * An on-demand Astro route, because the publishers' feeds carry no CORS
 * headers — a browser cannot read them directly, so something server-side has
 * to. It holds no key and no secret: these are public feeds, and this exists
 * only to cross the origin boundary and normalise the XML.
 *
 * Cached at the edge for fifteen minutes and served stale for an hour while it
 * revalidates, so a burst of visitors is one fetch to each publication rather
 * than one per reader. The page it feeds ships a build-time snapshot, so if
 * this is slow, rate-limited or down, nobody sees an empty page.
 */
import { collect } from '../../lib/feeds.mjs';

export const prerender = false;

export async function GET() {
  try {
    const data = await collect(60);
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=3600',
        // Same-origin in practice; permissive because the payload is public
        // material that is already published elsewhere.
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'feeds unavailable', items: [] }), {
      status: 502,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  }
}
