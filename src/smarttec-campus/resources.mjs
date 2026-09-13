// A cancelled initialization must not attach late assets to the next renderer.
export function abortable(promise, signal, disposeLate) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const abort = () => {
      if (settled) return;
      settled = true;
      reject(signal.reason || new Error('Loading cancelled'));
    };
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, {once: true});
    Promise.resolve(promise).then(value => {
      signal.removeEventListener('abort', abort);
      if (settled) { disposeLate?.(value); return; }
      settled = true;
      resolve(value);
    }, error => {
      signal.removeEventListener('abort', abort);
      if (settled) return;
      settled = true;
      reject(error);
    });
  });
}

export async function fetchBytes(url, signal, timeoutMs = 45000) {
  const controller = new AbortController();
  const abort = () => controller.abort(signal.reason);
  if (signal.aborted) abort();
  else signal.addEventListener('abort', abort, {once: true});
  const timer = setTimeout(() => controller.abort(new Error('Loading timed out. Please retry 3D.')), timeoutMs);
  try {
    const response = await fetch(url, {signal: controller.signal});
    if (!response.ok) throw new Error(`Campus asset unavailable (${response.status})`);
    return await response.arrayBuffer();
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', abort);
  }
}

export function waitUntilReady(check, signal) {
  return new Promise((resolve, reject) => {
    let timer;
    const finish = error => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      error ? reject(error) : resolve();
    };
    const abort = () => finish(signal.reason || new Error('Loading cancelled'));
    const poll = () => {
      if (signal.aborted) { abort(); return; }
      try {
        if (check()) finish();
        else timer = setTimeout(poll, 16);
      } catch (error) { finish(error); }
    };
    signal.addEventListener('abort', abort, {once: true});
    poll();
  });
}
