/**
 * News brief, wired up.
 *
 * Two jobs: filter by topic, and replace the build-time snapshot with whatever
 * /api/news has. The snapshot is already on screen and stays there if the
 * endpoint is unreachable — the page is never empty and never blocks on a
 * network call, which is the whole reason it ships with one.
 */

interface NewsItem {
  title: string;
  link: string;
  source: string;
  sourceId: string;
  topic: string;
  published: string | null;
  summary: string;
}

interface NewsPayload {
  fetched: string;
  unavailable: string[];
  items: NewsItem[];
}

const DAY = 86400000;

/** "3 hours ago" reads better than a timestamp for something this perishable. */
function ago(iso: string): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return '';
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins} minutes ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} ${hrs === 1 ? 'hour' : 'hours'} ago`;
  const days = Math.round(hrs / 24);
  return `${days} ${days === 1 ? 'day' : 'days'} ago`;
}

export function initNews(): void {
  const root = document.querySelector<HTMLElement>('[data-news]');
  if (!root) return;

  const list = root.querySelector<HTMLElement>('[data-news-list]');
  const status = root.querySelector<HTMLElement>('[data-news-status]');
  const empty = root.querySelector<HTMLElement>('[data-news-empty]');
  if (!list) return;

  let topic = 'all';

  function applyFilter(): void {
    let shown = 0;
    for (const li of list!.querySelectorAll<HTMLElement>('.news__item')) {
      const match = topic === 'all' || li.dataset.topic === topic;
      li.hidden = !match;
      if (match) shown += 1;
    }
    if (empty) empty.hidden = shown > 0;
  }

  // `.news__filter` and not `[data-topic]`: the list items carry that attribute
  // as well, so the broader selector bound a filter handler to every headline.
  const filters = root.querySelectorAll<HTMLButtonElement>('.news__filter[data-topic]');
  filters.forEach((btn) => {
    btn.addEventListener('click', () => {
      topic = btn.dataset.topic ?? 'all';
      filters.forEach((b) => {
        const on = b === btn;
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-pressed', String(on));
      });
      applyFilter();
    });
  });

  function render(items: NewsItem[]): void {
    const frag = document.createDocumentFragment();
    for (const item of items) {
      const li = document.createElement('li');
      li.className = 'news__item';
      li.dataset.topic = item.topic;

      const a = document.createElement('a');
      a.className = 'news__link';
      a.href = item.link;
      a.target = '_blank';
      // nofollow because we did not choose these links editorially, and
      // noopener because they are third-party.
      a.rel = 'noopener nofollow';

      const meta = document.createElement('p');
      meta.className = 'news__meta mono-label';
      const src = document.createElement('span');
      src.className = 'news__source';
      src.textContent = item.source;
      meta.append(src);
      if (item.published) {
        const dot = document.createElement('span');
        dot.className = 'news__dot';
        dot.setAttribute('aria-hidden', 'true');
        dot.textContent = '·';
        const time = document.createElement('time');
        time.dateTime = item.published;
        // Recent items read better relative; older ones read better dated.
        time.textContent = Date.now() - Date.parse(item.published) < 2 * DAY
          ? ago(item.published)
          : item.published.slice(0, 10);
        meta.append(dot, time);
      }
      const dot2 = document.createElement('span');
      dot2.className = 'news__dot';
      dot2.setAttribute('aria-hidden', 'true');
      dot2.textContent = '·';
      const top = document.createElement('span');
      top.className = 'news__topic';
      top.textContent = item.topic;
      meta.append(dot2, top);

      const h3 = document.createElement('h3');
      h3.className = 'news__title';
      // textContent throughout: these strings come from other people's feeds
      // and are never treated as markup.
      h3.textContent = item.title;

      a.append(meta, h3);
      if (item.summary) {
        const p = document.createElement('p');
        p.className = 'news__summary';
        p.textContent = item.summary;
        a.append(p);
      }
      li.append(a);
      frag.append(li);
    }
    list!.replaceChildren(frag);
    applyFilter();
  }

  function say(text: string, state: 'live' | 'stale' | ''): void {
    if (!status) return;
    status.textContent = text;
    if (state) status.dataset.state = state; else delete status.dataset.state;
  }

  void (async () => {
    try {
      const res = await fetch('/api/news', { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as NewsPayload;
      if (!Array.isArray(data.items) || !data.items.length) throw new Error('empty');

      render(data.items);
      const missing = data.unavailable?.length
        ? ` ${data.unavailable.join(' and ')} did not respond, so nothing from ${data.unavailable.length === 1 ? 'it' : 'them'} is here.`
        : '';
      say(`Live — checked ${ago(data.fetched)}.${missing}`, missing ? 'stale' : 'live');
    } catch {
      // The snapshot is already rendered. Say how old it is rather than
      // implying it is current.
      const shipped = document.querySelector<HTMLTimeElement>('.news__item time');
      say(
        `Showing the snapshot that shipped with this page${shipped ? `, newest story ${shipped.dateTime.slice(0, 10)}` : ''} — the live feed did not respond.`,
        'stale',
      );
    }
  })();
}
