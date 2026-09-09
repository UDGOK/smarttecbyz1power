/**
 * The site menu.
 *
 * One implementation for both routes. The cinematic homepage and the reading
 * pages used to differ here — the homepage had a full-bleed overlay behind a
 * toggle, the content pages had a horizontal strip of links that ran out of
 * room the moment a sixth page existed. Now both open the same overlay, so
 * there is one place where navigation behaviour lives and one place to fix it.
 *
 * Deliberately does NOT lock body scroll. The overlay is fixed and opaque, so
 * a stray scroll behind it changes nothing anyone can see — and on this site
 * every scroll-locking mechanism that has been added has eventually shipped a
 * page that could not be moved. `overscroll-behavior: contain` on the overlay
 * gets the useful half of the behaviour with none of that risk.
 */

/** Matches the opacity transition in chrome.css, so `hidden` lands after it. */
const FADE_MS = 400;

export interface MenuHandle {
  open(): void;
  close(): void;
  readonly isOpen: boolean;
}

export function initMenu(onToggle?: (open: boolean) => void): MenuHandle | null {
  const toggle = document.querySelector<HTMLButtonElement>('#menu-toggle');
  const menu = document.querySelector<HTMLElement>('#site-menu');
  if (!toggle || !menu) return null;

  let open = false;
  let closeTimer = 0;

  const set = (next: boolean): void => {
    if (next === open) return;
    open = next;
    toggle.setAttribute('aria-expanded', String(next));
    document.documentElement.classList.toggle('menu-open', next);
    window.clearTimeout(closeTimer);

    if (next) {
      menu.hidden = false;
      // A frame between unhiding and the class, or the transition has no
      // starting state to leave and the overlay simply appears.
      requestAnimationFrame(() => menu.classList.add('is-open'));
      menu.querySelector<HTMLElement>('a, button')?.focus();
    } else {
      menu.classList.remove('is-open');
      closeTimer = window.setTimeout(() => { menu.hidden = true; }, FADE_MS);
      toggle.focus();
    }
    onToggle?.(next);
  };

  toggle.addEventListener('click', () => set(!open));

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && open) set(false);
  });

  // The veil is part of the control: clicking the empty space closes it.
  menu.addEventListener('click', (e) => {
    if (e.target === menu) set(false);
  });

  // Following a link inside the overlay should not leave it open behind the
  // next page in a bfcache restore.
  for (const link of menu.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    link.addEventListener('click', () => set(false));
  }
  window.addEventListener('pageshow', (e) => {
    if ((e as PageTransitionEvent).persisted && open) set(false);
  });

  return { open: () => set(true), close: () => set(false), get isOpen() { return open; } };
}
