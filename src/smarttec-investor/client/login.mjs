/**
 * The login form's submit handler.
 *
 * LOCAL CHANGE — carry this forward on any module upgrade.
 *
 * This lived inline in login.astro. Astro inlines a hoisted script when the
 * chunk is small and imports nothing, and the investor CSP is `script-src
 * 'self'` with no `unsafe-inline` and no nonce — so the browser refused it,
 * the handler never attached, and the form fell back to a native GET that put
 * the password in the query string.
 *
 * Living in its own module gives the script an import to follow, so Astro
 * emits it to /_astro/ where 'self' covers it. Do not "simplify" this back
 * into the page, and do not add 'unsafe-inline' to the policy instead.
 */
const form = document.querySelector('#inv-login');

form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const button = form.querySelector('button');
  const status = document.querySelector('#login-status');
  button.disabled = true;
  status.textContent = 'Checking access…';
  try {
    const r = await fetch('/api/investor/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: form.querySelector('input').value }),
    });
    const b = await r.json();
    if (!r.ok) throw new Error(b.error || 'Unable to sign in.');
    location.assign('/investors');
  } catch (err) {
    status.textContent = err.message;
    button.disabled = false;
  }
});
