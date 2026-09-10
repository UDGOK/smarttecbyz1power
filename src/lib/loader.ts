/** Manual entrance. No renderer, timer or unrelated gesture can open it. */
export function initLoader(onComplete: () => void, onGesture?: () => void): void {
  const el = document.querySelector<HTMLElement>('#loader');
  const enter = el?.querySelector<HTMLAnchorElement>('#loader-skip');
  const release = (): void => {
    delete document.body.dataset.entryPending;
    document.querySelectorAll<HTMLElement>('[data-entry-content]').forEach(node => node.removeAttribute('inert'));
  };
  if (!el || !enter) { release(); onComplete(); return; }
  let done = false;
  enter.addEventListener('click', (event: MouseEvent) => {
    // Preserve native open-in-new-tab behavior and the /site no-script route.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    event.preventDefault();
    if (done) return;
    done = true;
    try { onGesture?.(); } catch { /* Audio never blocks entry. */ }
    el.classList.add('is-done');
    el.setAttribute('inert', '');
    // Keep the homepage hidden during the fade so its title never overlaps
    // the opening logo, even when the cached graphics code starts instantly.
    window.setTimeout(() => {
      el.hidden = true;
      release();
      try { onComplete(); } finally {
        const main = document.querySelector<HTMLElement>('#main');
        if (main) { main.tabIndex = -1; main.focus({ preventScroll: true }); }
      }
    }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 350);
  });
}
