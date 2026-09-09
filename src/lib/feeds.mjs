/**
 * Feed aggregation for the news brief.
 *
 * Shared by the serverless endpoint that serves it live and by the build-time
 * script that snapshots it, so the two can never parse the same XML in two
 * different ways.
 *
 * These are the eight publications the previous site aggregated. They are
 * public RSS: no API key, no vendor between us and the publisher, and nothing
 * to expire. The trade is that we parse XML ourselves, which is why the parser
 * below is deliberately narrow — it reads the six fields a card needs and
 * ignores everything else rather than pretending to be a general RSS library.
 *
 * Nothing here is SmartTec's reporting. Every item keeps its publication and
 * links out to it.
 */

/** The underscore prefix keeps this out of Vercel's route table. */
export const FEEDS = [
  { id: 'dcd', source: 'Data Center Dynamics', url: 'https://www.datacenterdynamics.com/rss/', topic: 'data centers' },
  { id: 'ess', source: 'Energy-Storage.news', url: 'https://www.energy-storage.news/feed/', topic: 'storage' },
  { id: 'ieee', source: 'IEEE Spectrum', url: 'https://spectrum.ieee.org/feeds/topic/computing.rss', topic: 'computing' },
  { id: 'tnp', source: 'The Next Platform', url: 'https://www.nextplatform.com/feed/', topic: 'compute' },
  { id: 'ud', source: 'Utility Dive', url: 'https://www.utilitydive.com/feeds/news/', topic: 'power' },
  { id: 'cm', source: 'Canary Media', url: 'https://canarymedia.com/feed', topic: 'energy' },
  { id: 'tc', source: 'TechCrunch', url: 'https://techcrunch.com/feed/', topic: 'industry' },
  { id: 'sth', source: 'ServeTheHome', url: 'https://www.servethehome.com/feed/', topic: 'hardware' },
];

const decode = (s) => s
  .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
  .replace(/&nbsp;/g, ' ')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&(?:apos|#39);/g, "'")
  .replace(/&amp;/g, '&');

/**
 * Decode, strip, decode.
 *
 * Twice on purpose. Several of these publishers escape their HTML inside the
 * description — `&lt;p data-block-key=...&gt;` — so stripping tags before
 * decoding entities leaves the markup behind, and the tags then reappear as
 * text once the entities resolve. Decoding first turns them into real tags the
 * strip can remove; the second pass handles entities that were inside the text
 * all along. `&amp;` is decoded last so `&amp;lt;` cannot become a tag.
 */
const strip = (s) => decode(
  decode(s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1'))
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' '),
)
  .replace(/\s+/g, ' ')
  .trim();

const tag = (block, name) => {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? strip(m[1]) : '';
};

/** Atom puts the URL in an attribute rather than in the element's text. */
const linkOf = (block) => {
  const rss = block.match(/<link(?:\s[^>]*)?>([\s\S]*?)<\/link>/i);
  if (rss && rss[1].trim().startsWith('http')) return strip(rss[1]);
  const atom = block.match(/<link[^>]*\srel=["']alternate["'][^>]*\shref=["']([^"']+)["']/i)
    ?? block.match(/<link[^>]*\shref=["']([^"']+)["']/i);
  return atom ? atom[1] : '';
};

export function parseFeed(xml, feed) {
  const blocks = xml.match(/<(?:item|entry)(?:\s[^>]*)?>[\s\S]*?<\/(?:item|entry)>/gi) ?? [];
  const out = [];
  for (const block of blocks) {
    const title = tag(block, 'title');
    const link = linkOf(block);
    if (!title || !link) continue;
    const when = tag(block, 'pubDate') || tag(block, 'published') || tag(block, 'updated') || tag(block, 'dc:date');
    const t = when ? Date.parse(when) : NaN;
    const summary = (tag(block, 'description') || tag(block, 'summary') || tag(block, 'content')).slice(0, 400);
    out.push({
      title,
      link,
      source: feed.source,
      sourceId: feed.id,
      topic: feed.topic,
      // Null rather than "now": an item with no date is not a new item, and
      // defaulting it to now would float undated posts to the top forever.
      published: Number.isFinite(t) ? new Date(t).toISOString() : null,
      summary,
    });
  }
  return out;
}

/** Per-feed cap, so one prolific publisher cannot crowd out the rest. */
const PER_FEED = 12;
const TIMEOUT_MS = 8000;

export async function collect(limit = 60) {
  const results = await Promise.all(FEEDS.map(async (feed) => {
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
      const res = await fetch(feed.url, {
        signal: ctl.signal,
        headers: { 'User-Agent': 'SmartTecNews/1.0 (+https://smarttecbyz1power.vercel.app)', Accept: 'application/rss+xml, application/xml, text/xml, */*' },
      });
      clearTimeout(timer);
      if (!res.ok) return { feed, items: [], ok: false };
      const items = parseFeed(await res.text(), feed).slice(0, PER_FEED);
      return { feed, items, ok: true };
    } catch {
      // A publication that is down is a publication that is down. The brief
      // still runs on the other seven rather than failing whole.
      return { feed, items: [], ok: false };
    }
  }));

  const items = results
    .flatMap((r) => r.items)
    .sort((a, b) => (Date.parse(b.published ?? '') || 0) - (Date.parse(a.published ?? '') || 0))
    .slice(0, limit);

  return {
    fetched: new Date().toISOString(),
    sources: FEEDS.map((f) => ({ id: f.id, source: f.source, topic: f.topic })),
    // Named so the page can say which publication is missing rather than
    // quietly showing a shorter list.
    unavailable: results.filter((r) => !r.ok).map((r) => r.feed.source),
    items,
  };
}
