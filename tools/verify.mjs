/**
 * Every check here caught a bug that had already shipped.
 *
 * Every case here is a regression that actually reached the live site, and
 * Every one of them passed the tests that existed at the time. They share a
 * shape: the mechanism worked, so looking stopped — while the *gesture* was
 * dead, or the *transitional* state was broken. The rule this file encodes:
 *
 *   Test the gesture, not the mechanism. Test the unsettled states, not just
 *   the loaded one.
 *
 * Usage:
 *   node tools/verify.mjs                     # against the local preview
 *   node tools/verify.mjs https://…           # against a deployment
 *
 * Needs playwright available (npx playwright install webkit).
 */
import { webkit, devices } from 'playwright';

const BASE = process.argv[2] ?? 'http://localhost:4321';
const ROUTES = ['/', '/site', '/power', '/colocation', '/compute', '/model-planner', '/news', '/about', '/contact'];
const HOME_SETTLE = 7000;

let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await webkit.launch();
const page = async (opts) => (await browser.newContext(opts)).newPage();
const desktop = { viewport: { width: 1440, height: 900 } };
const phone = { ...devices['iPhone 14'] };

/* 1. Every route still answers, with no failed subresource. ------------- */
{
  console.log('\nroutes');
  const p = await page(desktop);
  const bad = [];
  // Every route answers everywhere now. `npm run preview` builds against the
  // Node adapter and serves the real compiled output, so the on-demand routes
  // — /api/news and the investor section — exist locally too. They used to be
  // Vercel-only functions that 404'd under `astro preview`; that exemption is
  // gone, and a failure here is a failure anywhere.
  const local = /^https?:\/\/(localhost|127\.0\.0\.1)/.test(BASE);
  p.on('response', (r) => {
    if (r.status() < 400) return;
    bad.push(`${r.status()} ${r.url()}`);
  });
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e)));
  for (const route of ROUTES) {
    const res = await p.goto(BASE + route, { waitUntil: 'load' });
    await p.waitForTimeout(1500);
    check(`${route} responds`, res.status() === 200, String(res.status()));
  }
  check('no failed requests', bad.length === 0, bad.slice(0, 2).join('; '));
  check('no page errors', errs.length === 0, errs.slice(0, 1).join('; '));

  {
    const res = await p.request.get(`${BASE}/api/news`);
    let items = 0;
    try { items = ((await res.json()).items ?? []).length; } catch { /* not json */ }
    check('/api/news serves a live feed', res.ok() && items > 0, `${res.status()}, ${items} items`);
  }
  await p.close();
}

/* 2. THE GESTURE, not the mechanism. -----------------------------------
   scrollBy sails past a non-passive touchmove listener that calls
   preventDefault, so it proved nothing when the page was immovable under a
   real finger. Dispatch a touch sequence and read defaultPrevented instead. */
{
  console.log('\ntouch is not cancelled (the gesture, not scrollBy)');
  for (const route of ['/', '/site', '/news', '/model-planner']) {
    const p = await page(phone);
    await p.goto(BASE + route, { waitUntil: 'load' });
    await p.waitForTimeout(route === '/' ? HOME_SETTLE : 2200);
    const cancelled = await p.evaluate(() => {
      const fire = (type, y) => {
        const e = new Event(type, { bubbles: true, cancelable: true });
        const t = [{ clientX: 180, clientY: y, identifier: 0 }];
        Object.defineProperty(e, 'touches', { value: t });
        Object.defineProperty(e, 'changedTouches', { value: t });
        document.documentElement.dispatchEvent(e);
        return e.defaultPrevented;
      };
      fire('touchstart', 600);
      const out = [500, 400, 300].map((y) => fire('touchmove', y));
      fire('touchend', 300);
      return out.some(Boolean);
    });
    check(`${route} touchmove reaches the page`, !cancelled);
    await p.close();
  }
}

/* 3. THE UNSETTLED STATE: the seconds before the scene is ready. --------
   The stage sections are 250vh, so the document is scrollable from first
   paint while nothing is listening. Scrolling there slid past the sticky
   panel into empty space over the canvas's green gradient, and the arming
   that followed took scrolling away and stranded the visitor in it. */
{
  console.log('\nboot window: nothing to scroll into before the scene arms');
  for (const [label, opts] of [['desktop', desktop], ['phone', phone]]) {
    const p = await page(opts);
    await p.route(/_astro\/(three|stage-|host|registry)[^/]*\.js/, async (route) => {
      await new Promise((r) => setTimeout(r, 3500));
      await route.continue();
    });
    await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(1400);
    const boot = await p.evaluate(() => ({
      docH: document.documentElement.scrollHeight,
      vh: innerHeight,
      booting: document.body.dataset.booting !== undefined,
    }));
    check(`${label} document is not scrollable while booting`,
      boot.docH <= boot.vh + 4, `docH ${boot.docH} vs vh ${boot.vh}`);
    await p.waitForTimeout(8000);
    const armed = await p.evaluate(() => ({
      booting: document.body.dataset.booting !== undefined,
      canvasHidden: document.querySelector('#experience-canvas')?.hidden,
      docH: document.documentElement.scrollHeight,
    }));
    check(`${label} releases the boot cap once armed`, !armed.booting);
    await p.close();
  }
}

/* 4. THE UNSETTLED STATE: a GPU that takes the context away. ------------
   The canvas carries a green gradient, so a dead renderer is a full screen of
   green with the scroll machinery still running. */
{
  console.log('\nlost WebGL context degrades to a readable document');
  const p = await page(desktop);
  await p.goto(BASE + '/', { waitUntil: 'load' });
  await p.waitForTimeout(HOME_SETTLE);
  await p.evaluate(() => document.querySelector('#loader-skip')?.click());
  await p.waitForTimeout(1200);
  const dropped = await p.evaluate(() => {
    const c = document.querySelector('#experience-canvas');
    const gl = c?.getContext('webgl2') ?? c?.getContext('webgl');
    const ext = gl?.getExtension('WEBGL_lose_context');
    if (!ext) return false;
    ext.loseContext();
    return true;
  });
  if (!dropped) {
    check('WEBGL_lose_context available', false, 'skipped');
  } else {
    await p.waitForTimeout(2500);
    const s = await p.evaluate(() => ({
      canvasHidden: document.querySelector('#experience-canvas').hidden,
      panels: [...document.querySelectorAll('[data-stage-panel]')].filter((x) => !x.hidden).length,
      readable: [...document.querySelectorAll('.stage-panel__title .line__inner')]
        .every((l) => Number(getComputedStyle(l).opacity) > 0.9),
      docH: document.documentElement.scrollHeight,
      vh: innerHeight,
    }));
    check('canvas hides so the green gradient is not the page', s.canvasHidden);
    check('all stages become readable', s.panels === 5 && s.readable, `${s.panels} panels`);
    check('document scrolls natively again', s.docH > s.vh);
  }
  await p.close();
}

/* 5. THE GESTURE: the menu must close by the control people actually use.
   It closed on Escape and on the veil, so the tests passed — while the
   overlay covered its own X and the page looked frozen. */
{
  console.log('\nmenu closes by its own button');
  for (const [label, opts, route, wait] of [
    ['home desktop', desktop, '/', HOME_SETTLE],
    ['site desktop', desktop, '/site', 2000],
    ['site phone', phone, '/site', 2000],
  ]) {
    const p = await page(opts);
    await p.goto(BASE + route, { waitUntil: 'load' });
    await p.waitForTimeout(wait);
    if (route === '/') { await p.evaluate(() => document.querySelector('#loader-skip')?.click()); await p.waitForTimeout(1200); }
    await p.click('#menu-toggle');
    await p.waitForTimeout(800);
    const covers = await p.evaluate(() => {
      const m = document.querySelector('#site-menu').getBoundingClientRect();
      return Math.round(m.width) === innerWidth && Math.round(m.height) === innerHeight;
    });
    check(`${label} overlay covers the viewport`, covers);
    let closed = false;
    try {
      await p.click('#menu-toggle', { timeout: 4000 });
      await p.waitForTimeout(800);
      closed = await p.evaluate(() => document.querySelector('#site-menu').hidden);
    } catch { /* the overlay is eating the click — that is the failure */ }
    check(`${label} closes by clicking the X`, closed);
    // And the page must scroll afterwards.
    await p.evaluate(() => scrollBy(0, 700));
    await p.waitForTimeout(400);
    const moved = await p.evaluate(() => scrollY > 0 || document.body.dataset.virtualScroll !== undefined);
    check(`${label} scrolls after using the menu`, moved);
    await p.close();
  }
}

/* 6. Chrome that shares a corner must not overlap. ---------------------- */
{
  console.log('\nchrome does not collide');
  for (const [label, opts] of [['1440', { viewport: { width: 1440, height: 900 } }],
                               ['1024', { viewport: { width: 1024, height: 768 } }],
                               ['phone', phone]]) {
    const p = await page(opts);
    await p.goto(BASE + '/', { waitUntil: 'load' });
    await p.waitForTimeout(HOME_SETTLE);
    const overlap = await p.evaluate(() => {
      const t = document.querySelector('#menu-toggle')?.getBoundingClientRect();
      const b = document.querySelector('.power-badge')?.getBoundingClientRect();
      if (!t || !b) return null;
      return !(t.right <= b.left || b.right <= t.left || t.bottom <= b.top || b.bottom <= t.top);
    });
    check(`${label} menu toggle clear of the power badge`, overlap === false);
    await p.close();
  }
}

/* 7. Both journeys still work end to end. ------------------------------- */
{
  console.log('\nthe journey');
  const p = await page(desktop);
  await p.goto(BASE + '/', { waitUntil: 'load' });
  await p.waitForTimeout(HOME_SETTLE);
  const seen = new Set();
  for (let i = 0; i < 40; i++) {
    await p.mouse.wheel(0, 900);
    await p.waitForTimeout(200);
    seen.add(await p.evaluate(() => document.querySelector('#ruler-readout')?.textContent));
  }
  check('desktop wheel reaches every stage', seen.size >= 5, [...seen].join(' '));
  const back = new Set();
  for (let i = 0; i < 40; i++) {
    await p.mouse.wheel(0, -900);
    await p.waitForTimeout(200);
    back.add(await p.evaluate(() => document.querySelector('#ruler-readout')?.textContent));
  }
  check('desktop wheel comes back', back.size >= 5, [...back].join(' '));
  await p.close();

  const ph = await page(phone);
  await ph.goto(BASE + '/', { waitUntil: 'load' });
  await ph.waitForTimeout(HOME_SETTLE);
  const down = new Set(); const up = new Set();
  const h = await ph.evaluate(() => innerHeight);
  for (let i = 0; i < 22; i++) { await ph.evaluate((v) => scrollBy(0, v), h * 0.7); await ph.waitForTimeout(420); down.add(await ph.evaluate(() => document.querySelector('#ruler-readout')?.textContent)); }
  for (let i = 0; i < 22; i++) { await ph.evaluate((v) => scrollBy(0, -v), h * 0.7); await ph.waitForTimeout(420); up.add(await ph.evaluate(() => document.querySelector('#ruler-readout')?.textContent)); }
  check('phone spine reaches every stage', down.size >= 5, [...down].join(' '));
  check('phone spine comes back', up.size >= 5, [...up].join(' '));
  await ph.close();
}

/* 8. The private routes stay private. ----------------------------------
   /investors is password-gated, and the failure that matters is the silent
   one: a route that quietly starts serving the survey, the knowledge base or
   the financial model to anyone who types the URL. So this asserts the
   negative. Anonymous requests must never come back 200, whatever the reason
   — redirected to login when the room is configured, refused outright when it
   is not. Both are correct; a 200 never is.

   It also checks the room stays out of the index. These pages carry owner
   financials and a survey; a crawler finding them is a disclosure, not a
   ranking problem. */
{
  console.log('\nthe investor room refuses anonymous callers');
  const p = await page(desktop);

  const room = await p.request.get(`${BASE}/investors`, { maxRedirects: 0 });
  check('/investors does not answer anonymously', room.status() !== 200, String(room.status()));

  // Every action behind the gate, not just the front door — each of these
  // returns private material once a session exists.
  for (const action of ['bootstrap', 'survey', 'survey-image', 'faq']) {
    const res = await p.request.get(`${BASE}/api/investor/${action}`, { maxRedirects: 0 });
    check(`/api/investor/${action} is gated`, res.status() !== 200, String(res.status()));
  }

  // The login page is the one private route that must render for a stranger.
  // It may carry no private material of its own.
  const login = await p.request.get(`${BASE}/investors/login`);
  const body = await login.text();
  check('/investors/login renders', login.status() === 200, String(login.status()));
  check('login page is noindex', /noindex/i.test(login.headers()['x-robots-tag'] ?? ''), login.headers()['x-robots-tag'] ?? 'header absent');
  check('login page is not cached', /no-store/.test(login.headers()['cache-control'] ?? ''), login.headers()['cache-control'] ?? 'header absent');
  check(
    'login page leaks no secret',
    !/INVESTOR_(PASSWORD_HASH|SESSION_SECRET)|UPSTASH_REDIS_REST_TOKEN/.test(body) && !/scrypt\$/i.test(body),
  );

  // The survey PDF is served from the server bundle through an authenticated
  // handler. If it ever appears under /public it becomes a static file that
  // no session guards.
  const stray = await p.request.get(`${BASE}/investor-assets/survey.pdf`);
  check('survey is not a public static file', stray.status() === 404, String(stray.status()));

  await p.close();
}

await browser.close();
console.log(`\n${failures === 0 ? 'all checks passed' : `${failures} FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
