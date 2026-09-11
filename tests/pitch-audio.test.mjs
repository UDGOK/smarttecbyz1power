import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {mountPitchAudio} from '../src/smarttec-investor/client/pitch-audio.mjs';

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return {promise, resolve, reject};
};
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

function fixture({resumeResults = [], savedVolume, paused = false, reduced = false} = {}) {
  const dom = new JSDOM(`<!doctype html><body data-paused="${paused}">
    <button id="pitch-play">Play presentation</button>
    <button id="pitch-sound" aria-pressed="false"><span data-sound-label>Sound off</span></button>
    <button id="pitch-audio-options" aria-expanded="false" hidden></button>
    <dialog id="pitch-audio-panel"><input id="pitch-volume" type="range" min="0" max="100">
      <output id="pitch-volume-value"></output><button id="pitch-audio-close">Close</button>
      <button id="pitch-audio-mute">Mute</button></dialog>
    <p id="pitch-audio-message" role="status"></p>
  </body>`, {url: 'https://www.smarttec.dev/investors/pitch'});
  const win = dom.window, doc = win.document, calls = [], contexts = [], scoreOptions = [], panelChanges = [];
  const timers = new Map(); let timerId = 0;
  win.setTimeout = (callback, delay) => { const id = ++timerId; timers.set(id, {callback, delay}); return id; };
  win.clearTimeout = id => timers.delete(id);
  win.matchMedia = () => ({matches: reduced, addEventListener() {}, removeEventListener() {}});
  if (savedVolume !== undefined) win.sessionStorage.setItem('smarttec:pitch-volume', String(savedVolume));
  const remainingResumes = [...resumeResults];
  class FakeAudioContext extends win.EventTarget {
    state = 'suspended'; currentTime = 0; resumeCalls = 0; suspendCalls = 0; closeCalls = 0;
    constructor() { super(); contexts.push(this); }
    stateChange(next) { this.state = next; this.dispatchEvent(new win.Event('statechange')); }
    resume() {
      this.resumeCalls++;
      const outcome = remainingResumes.length ? remainingResumes.shift() : Promise.resolve();
      return Promise.resolve(typeof outcome === 'function' ? outcome() : outcome).then(() => {
        if (this.state !== 'closed') this.stateChange('running');
      });
    }
    suspend() { this.suspendCalls++; this.stateChange('suspended'); return Promise.resolve(); }
    close() { this.closeCalls++; this.stateChange('closed'); return Promise.resolve(); }
  }
  win.AudioContext = FakeAudioContext;
  const score = {
    setActive: value => calls.push(['active', value]),
    setVolume: value => calls.push(['volume', value]),
    setChapter: id => calls.push(['chapter', id]),
    schedule: until => calls.push(['schedule', until]),
    dispose: () => calls.push(['dispose'])
  };
  const panel = doc.getElementById('pitch-audio-panel');
  panel.showModal = () => { panel.open = true; };
  panel.close = () => { if (!panel.open) return; panel.open = false; panel.dispatchEvent(new win.Event('close')); };
  const manager = mountPitchAudio(doc, win, {
    createScore: (context, options) => { scoreOptions.push({context, ...options}); return score; },
    onPanelChange: open => panelChanges.push(open)
  });
  const $ = id => doc.getElementById(id);
  return {
    dom, doc, win, manager, contexts, calls, timers, scoreOptions, panelChanges, panel, $,
    get label() { return doc.querySelector('[data-sound-label]').textContent; },
    events: name => calls.filter(call => call[0] === name),
    volume(percent) { $('pitch-volume').value = String(percent); $('pitch-volume').dispatchEvent(new win.Event('input', {bubbles: true})); },
    runTimers() { for (const [id, {callback}] of [...timers]) { timers.delete(id); callback(); } },
    cleanup() { manager.dispose(); dom.window.close(); }
  };
}

test('mount and saved volume never grant sound consent or create an AudioContext', async () => {
  const f = fixture({savedVolume: .72});
  try {
    assert.equal(f.manager.context, null);
    assert.equal(f.contexts.length, 0);
    assert.equal(f.scoreOptions.length, 0);
    assert.equal(f.label, 'Sound off');
    assert.equal(f.$('pitch-volume').value, '72');
    assert.equal(f.$('pitch-audio-options').hidden, true);
    f.manager.setChapter('fleet');
    f.manager.tick();
    assert.deepEqual(f.calls, []);
    const starting = f.manager.toggle();
    assert.equal(f.contexts.length, 1, 'Context is created inside the explicit gesture');
    assert.equal(f.contexts[0].resumeCalls, 1, 'resume is called before the gesture returns');
    await starting;
    assert.equal(f.scoreOptions[0].chapter, 'fleet');
    assert.equal(f.scoreOptions[0].volume, .72);
    assert.equal(f.label, 'Sound on');
    assert.equal(f.$('pitch-sound').getAttribute('aria-pressed'), 'true');
    assert.deepEqual(f.events('active').at(-1), ['active', true]);
  } finally { f.cleanup(); }
});

test('explicit sound remains independent of paused slides and reduced motion', async () => {
  const f = fixture({paused: true, reduced: true});
  try {
    await f.manager.toggle();
    assert.equal(f.doc.body.dataset.paused, 'true');
    assert.equal(f.label, 'Sound on');
    const before = f.events('schedule').length;
    f.contexts[0].currentTime = 4;
    f.$('pitch-play').click();
    f.manager.tick();
    assert.equal(f.events('schedule').length, before + 1);
    assert.deepEqual(f.events('schedule').at(-1), ['schedule', 4.35]);
    assert.equal(f.contexts[0].suspendCalls, 0);
  } finally { f.cleanup(); }
});

test('rejected resume leaves an honest retry state and reuses the context on success', async () => {
  const f = fixture({resumeResults: [() => Promise.reject(new Error('gesture denied'))]});
  try {
    await f.manager.toggle();
    assert.equal(f.label, 'Start sound');
    assert.equal(f.$('pitch-sound').getAttribute('aria-pressed'), 'false');
    assert.match(f.$('pitch-audio-message').textContent, /could not start.*try again/i);
    assert.equal(f.events('active').some(([, value]) => value), false);
    await f.manager.toggle();
    assert.equal(f.contexts.length, 1);
    assert.equal(f.scoreOptions.length, 1);
    assert.equal(f.contexts[0].resumeCalls, 2);
    assert.equal(f.label, 'Sound on');
    assert.equal(f.$('pitch-audio-message').textContent, '');
    assert.deepEqual(f.events('active').at(-1), ['active', true]);
  } finally { f.cleanup(); }
});

test('a pending resume cannot reactivate the score after the user toggles sound off', async () => {
  const gate = deferred(), f = fixture({resumeResults: [gate.promise]});
  try {
    const pending = f.manager.toggle();
    assert.equal(f.label, 'Starting…');
    await f.manager.toggle();
    assert.equal(f.label, 'Sound off');
    assert.equal(f.timers.size, 1);
    assert.equal([...f.timers.values()][0].delay, 300);
    gate.resolve(); await pending;
    f.manager.tick();
    assert.equal(f.events('active').some(([, value]) => value), false);
    assert.equal(f.events('schedule').length, 0);
    assert.equal(f.label, 'Sound off');
    f.runTimers(); await flush();
    assert.equal(f.contexts[0].suspendCalls, 1);
    assert.equal(f.contexts[0].state, 'suspended');
  } finally { f.cleanup(); }
});

test('hiding during pending resume prevents stale activation and restores only existing consent', async () => {
  const gate = deferred(), f = fixture({resumeResults: [gate.promise]});
  try {
    const pending = f.manager.toggle();
    f.manager.setBlocked('hidden', true);
    assert.equal(f.contexts[0].suspendCalls, 1, 'Hidden audio suspends immediately');
    gate.resolve(); await pending;
    f.manager.tick();
    assert.equal(f.events('active').some(([, value]) => value), false);
    assert.equal(f.events('schedule').length, 0);
    assert.equal(f.$('pitch-sound').getAttribute('aria-pressed'), 'false');
    assert.equal(f.label, 'Sound paused');
    f.manager.setBlocked('hidden', false); await flush();
    assert.equal(f.contexts.length, 1);
    assert.equal(f.contexts[0].resumeCalls, 2);
    assert.deepEqual(f.events('active').at(-1), ['active', true]);
    assert.equal(f.label, 'Sound on');
  } finally { f.cleanup(); }
});

test('dispose invalidates a pending resume and closes the context and score exactly once', async () => {
  const gate = deferred(), f = fixture({resumeResults: [gate.promise]});
  try {
    const pending = f.manager.toggle();
    f.manager.dispose(); f.manager.dispose();
    gate.resolve(); await pending;
    f.manager.tick(); await f.manager.toggle();
    assert.equal(f.contexts.length, 1);
    assert.equal(f.contexts[0].closeCalls, 1);
    assert.equal(f.events('dispose').length, 1);
    assert.equal(f.events('active').some(([, value]) => value), false);
    assert.equal(f.events('schedule').length, 0);
    assert.equal(f.timers.size, 0);
  } finally { f.cleanup(); }
});

test('zero volume shows muted state and the Sound gesture restores the last audible level', async () => {
  const f = fixture();
  try {
    await f.manager.toggle();
    f.volume(72);
    assert.equal(f.win.sessionStorage.getItem('smarttec:pitch-volume'), '0.72');
    f.volume(0);
    assert.equal(f.label, 'Sound muted');
    assert.equal(f.$('pitch-sound').getAttribute('aria-pressed'), 'false');
    assert.deepEqual(f.events('volume').at(-1), ['volume', 0]);
    await f.manager.toggle();
    assert.equal(f.label, 'Sound on');
    assert.equal(f.$('pitch-volume').value, '72');
    assert.equal(f.$('pitch-volume-value').textContent, '72%');
    assert.deepEqual(f.events('volume').at(-1), ['volume', .72]);
    assert.equal(f.contexts.length, 1);
  } finally { f.cleanup(); }
});

test('an interrupted context advertises a retry and resumes without creating a second graph', async () => {
  const f = fixture();
  try {
    await f.manager.toggle();
    f.contexts[0].stateChange('interrupted');
    assert.equal(f.label, 'Start sound');
    assert.equal(f.$('pitch-sound').getAttribute('aria-pressed'), 'false');
    assert.match(f.$('pitch-audio-message').textContent, /paused by the browser/i);
    const scheduled = f.events('schedule').length;
    f.manager.tick(); assert.equal(f.events('schedule').length, scheduled);
    await f.manager.toggle();
    assert.equal(f.label, 'Sound on');
    assert.equal(f.contexts[0].resumeCalls, 2);
    assert.equal(f.contexts.length, 1);
    assert.equal(f.scoreOptions.length, 1);
  } finally { f.cleanup(); }
});

test('dispose closes an open volume dialog, releases its lock and removes all handlers', async () => {
  const f = fixture();
  try {
    await f.manager.toggle();
    f.$('pitch-audio-options').click();
    assert.equal(f.panel.open, true);
    assert.equal(f.manager.panelOpen, true);
    assert.equal(f.$('pitch-audio-options').getAttribute('aria-expanded'), 'true');
    assert.deepEqual(f.panelChanges, [true]);
    f.manager.dispose(); f.manager.dispose();
    assert.equal(f.panel.open, false);
    assert.equal(f.manager.panelOpen, false);
    assert.equal(f.$('pitch-audio-options').getAttribute('aria-expanded'), 'false');
    assert.deepEqual(f.panelChanges, [true, false]);
    assert.equal(f.contexts[0].closeCalls, 1);
    assert.equal(f.events('dispose').length, 1);
    assert.equal(f.timers.size, 0);
    const calls = f.calls.length;
    f.$('pitch-sound').click(); f.volume(30); f.contexts[0].stateChange('interrupted');
    await flush();
    assert.equal(f.calls.length, calls);
    assert.equal(f.contexts.length, 1);
  } finally { f.cleanup(); }
});

