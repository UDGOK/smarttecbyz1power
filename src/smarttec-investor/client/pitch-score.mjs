// Original SmartTec ambient composition. No samples, network, DOM or timers.
// The caller owns AudioContext consent/resume/suspend and calls schedule() ahead.
const profile = (chord, motif, options = {}) => Object.freeze({
  chord: Object.freeze(chord), motif: Object.freeze(motif),
  bpm: 64, spacing: 1, pad: .88, pluck: .19, air: .012,
  brightness: 1800, release: 1.65, ...options
});

export const pitchScoreProfiles = Object.freeze({
  opening: profile([62, 66, 69], [74, 81, 78, 76, 83, 78, 81, 76]),
  thesis: profile([62, 66, 71], [74, null, 78, null, 81, null, 76, null], {pad: .94, pluck: .16, release: 2.2}),
  fleet: profile([62, 69, 74], [74, 81, 76, 81, 78, 81, 76, 81], {spacing: .75, pluck: .18}),
  power: profile([62, 66, 71], [74, 76, 78, 81, 78, 76, 83, 81], {spacing: .5, pluck: .15, air: .016, brightness: 2050, release: 1.5}),
  'site-rights': profile([62, 64, 69], [69, null, 74, null, 76, null, 74, null], {pad: .98, pluck: .15, brightness: 1450, release: 2.2}),
  commercial: profile([62, 66, 69], [74, null, null, 76, null, 69, null, null], {pad: .86, pluck: .17, air: .008, brightness: 1500}),
  'founder-capital': profile([59, 62, 66], [71, null, 74, null, null, 78, null, null], {pad: .94, pluck: .17, air: .008, brightness: 1550}),
  cooling: profile([64, 69, 74], [83, 81, 78, 76, 74, null, 76, null], {spacing: .85, pad: .84, pluck: .15, air: .024, brightness: 2200, release: 2}),
  'funding-bridge': profile([62, 66, 71], [74, null, 71, null, null, 76, null, null], {pad: .91, pluck: .16, air: .008, brightness: 1550}),
  delivery: profile([62, 69, 74], [74, 78, null, 81, 76, 83, null, 81], {spacing: .65, pad: .90, pluck: .17, air: .017, brightness: 2050}),
  team: profile([59, 62, 66], [74, null, 78, null, 76, null, 71, null], {pad: 1, pluck: .15, air: .010, brightness: 1450, release: 2.25}),
  investment: profile([62, 64, 69], [69, null, null, 74, null, 76, null, null], {pad: .93, pluck: .16, air: .008, brightness: 1500}),
  'next-steps': profile([62, 66, 69], [74, 81, 78, 76, 83, 78, 81, null], {pad: .96, pluck: .18, air: .013, release: 2})
});
export const pitchScoreChapterIds = Object.freeze(Object.keys(pitchScoreProfiles));
const frequency = midi => 440 * 2 ** ((midi - 69) / 12);
const clamp = (value, fallback) => Number.isFinite(Number(value)) ? Math.max(0, Math.min(1, Number(value))) : fallback;

/**
 * A fixed graph: six pad oscillators, six reusable plucks, one slow modulation
 * oscillator and one looping texture source. Navigation creates no AudioNodes.
 * Defaults to inactive. output is the final GainNode connected to destination.
 */
export function createPitchScore(context, {volume = .55, chapter = 'opening'} = {}) {
  if (!context?.createGain || !context?.createOscillator) throw new TypeError('A Web Audio context is required.');
  const nodes = [], sources = [];
  const node = value => { nodes.push(value); return value; };
  const gain = value => { const g = node(context.createGain()); g.gain.value = value; return g; };
  const now = () => Math.max(0, context.currentTime);
  const time = at => Number.isFinite(Number(at)) ? Math.max(now(), Number(at)) : now();
  let disposed = false, active = false, volumeValue = clamp(volume, .55);
  let currentId = Object.hasOwn(pitchScoreProfiles, chapter) ? chapter : 'opening';
  let current = pitchScoreProfiles[currentId], bankIndex = 0, noteIndex = 0, voiceIndex = 0, nextNote = now() + .25;

  // Tracked ramps give a smooth fallback on browsers without cancelAndHoldAtTime.
  const ramps = new WeakMap();
  function valueAt(param, at) {
    const r = ramps.get(param);
    if (!r) return param.value;
    if (at <= r.start) return r.from;
    if (at >= r.end) return r.to;
    return r.from + (r.to - r.from) * ((at - r.start) / (r.end - r.start));
  }
  function ramp(param, target, at, seconds) {
    const from = valueAt(param, at);
    if (typeof param.cancelAndHoldAtTime === 'function') param.cancelAndHoldAtTime(at);
    else param.cancelScheduledValues(at);
    // An explicit anchor preserves the quiet interval before a future ramp.
    param.setValueAtTime(from, at);
    param.linearRampToValueAtTime(target, at + seconds);
    ramps.set(param, {from, to: target, start: at, end: at + seconds});
  }
  function oscillator(type, hz, target) {
    const o = node(context.createOscillator());
    o.type = type; o.frequency.value = hz; o.connect(target);
    o.start(now()); sources.push(o); return o;
  }

  const mix = gain(1), highpass = node(context.createBiquadFilter()), lowpass = node(context.createBiquadFilter());
  highpass.type = 'highpass'; highpass.frequency.value = 125; highpass.Q.value = .55;
  lowpass.type = 'lowpass'; lowpass.frequency.value = 2550; lowpass.Q.value = .45;
  const compressor = node(context.createDynamicsCompressor());
  compressor.threshold.value = -14; compressor.knee.value = 12;
  compressor.ratio.value = 3; compressor.attack.value = .025; compressor.release.value = .4;
  const limiter = node(context.createWaveShaper()), curve = new Float32Array(4097);
  for (let i = 0; i < curve.length; i++) {
    const x = i * 2 / (curve.length - 1) - 1;
    curve[i] = .58 * Math.tanh(x / .58);
  }
  limiter.curve = curve; limiter.oversample = '2x';
  const level = gain(volumeValue), output = gain(0);
  mix.connect(highpass); highpass.connect(lowpass); lowpass.connect(compressor);
  compressor.connect(limiter); limiter.connect(level); level.connect(output); output.connect(context.destination);

  // A quiet, bounded echo supplies space without an external reverb sample.
  const delay = node(context.createDelay(1)), feedback = gain(.17), wet = gain(.16);
  delay.delayTime.value = .375;
  mix.connect(delay); delay.connect(feedback); feedback.connect(delay);
  delay.connect(wet); wet.connect(highpass);

  const breathDepth = gain(.009);
  oscillator('sine', .067, breathDepth);
  const banks = Array.from({length: 2}, (_, index) => {
    const bus = gain(index === 0 ? current.pad : 0);
    const filter = node(context.createBiquadFilter());
    filter.type = 'lowpass'; filter.frequency.value = current.brightness; filter.Q.value = .4;
    bus.connect(filter); filter.connect(mix);
    const tones = current.chord.map((midi, i) => {
      const amplitude = gain([.118, .101, .086][i]);
      const panner = node(context.createStereoPanner()); panner.pan.value = [-.35, .08, .35][i];
      const osc = oscillator('triangle', frequency(midi), amplitude);
      osc.detune.value = (index === 0 ? 1 : -1) * [-2, 1.5, 2.5][i];
      breathDepth.connect(amplitude.gain);
      amplitude.connect(panner); panner.connect(bus);
      return osc;
    });
    return {bus, filter, tones};
  });

  const wave = context.createPeriodicWave(new Float32Array([0, 0, 0, 0]), new Float32Array([0, 1, .18, .035]));
  const plucks = Array.from({length: 6}, (_, i) => {
    const envelope = gain(0), panner = node(context.createStereoPanner());
    panner.pan.value = [-.35, .28, -.12, .38, -.25, .1][i];
    const osc = oscillator('sine', frequency(74), envelope); osc.setPeriodicWave(wave);
    envelope.connect(panner); panner.connect(mix);
    return {osc, envelope};
  });

  // Seeded, precomputed texture is deterministic and never allocates during playback.
  const texture = node(context.createBufferSource()), buffer = context.createBuffer(1, context.sampleRate * 3, context.sampleRate);
  const samples = buffer.getChannelData(0); let seed = 741103;
  for (let i = 0; i < samples.length; i++) { seed = (1664525 * seed + 1013904223) >>> 0; samples[i] = (seed / 4294967296) * 2 - 1; }
  texture.buffer = buffer; texture.loop = true;
  const airFilter = node(context.createBiquadFilter()), air = gain(current.air);
  airFilter.type = 'bandpass'; airFilter.frequency.value = 1100; airFilter.Q.value = .6;
  texture.connect(airFilter); airFilter.connect(air); air.connect(mix);
  texture.start(now()); sources.push(texture);

  function cancelPlucks(at) {
    for (const voice of plucks) {
      const param = voice.envelope.gain;
      if (typeof param.cancelAndHoldAtTime === 'function') param.cancelAndHoldAtTime(at);
      else { const value = param.value; param.cancelScheduledValues(at); param.setValueAtTime(value, at); }
      param.linearRampToValueAtTime(0, at + .18);
      voice.osc.frequency.cancelScheduledValues(at);
    }
  }
  function setChapter(id, at = context.currentTime) {
    if (disposed) return;
    const nextId = Object.hasOwn(pitchScoreProfiles, id) ? id : 'opening';
    if (nextId === currentId) return;
    const t = time(at), next = pitchScoreProfiles[nextId], nextBank = 1 - bankIndex;
    const incoming = banks[nextBank], outgoing = banks[bankIndex];
    // Two reusable banks crossfade for one second. A rapidly reused bank glides
    // its existing tones rather than abruptly retuning an audible oscillator.
    incoming.tones.forEach((osc, i) => ramp(osc.frequency, frequency(next.chord[i]), t, .9));
    ramp(incoming.filter.frequency, next.brightness, t, 1);
    ramp(incoming.bus.gain, next.pad, t, 1);
    ramp(outgoing.bus.gain, 0, t, 1);
    ramp(air.gain, next.air, t, 1);
    cancelPlucks(t);
    current = next; currentId = nextId; bankIndex = nextBank;
    noteIndex = 0; nextNote = t + .22;
  }
  function setVolume(value, at = context.currentTime) {
    if (disposed) return;
    volumeValue = clamp(value, volumeValue);
    ramp(level.gain, volumeValue, time(at), .18);
  }
  function setActive(value, at = context.currentTime) {
    if (disposed || Boolean(value) === active) return;
    const t = time(at); active = Boolean(value);
    ramp(output.gain, active ? 1 : 0, t, active ? .8 : .25);
    cancelPlucks(t); nextNote = t + .25;
  }
  function schedule(untilTime) {
    if (disposed || !active || !Number.isFinite(untilTime)) return;
    const t = now(), end = Math.min(untilTime, t + 600);
    if (nextNote < t) nextNote = t + .015;
    let count = 0;
    while (nextNote < end && count++ < 4096) {
      const midi = current.motif[noteIndex % current.motif.length];
      if (midi !== null) {
        const voice = plucks[voiceIndex++ % plucks.length], start = nextNote;
        const amplitude = current.pluck * (noteIndex % 4 === 0 ? 1 : .82);
        voice.osc.frequency.setValueAtTime(frequency(midi), start);
        const envelope = voice.envelope.gain;
        // Minimum voice reuse is 2.81 s; all releases finish within 2.25 s.
        envelope.setValueAtTime(0, start);
        envelope.linearRampToValueAtTime(amplitude, start + .075);
        envelope.exponentialRampToValueAtTime(.0001, start + current.release);
        envelope.linearRampToValueAtTime(0, start + current.release + .04);
      }
      noteIndex++; nextNote += (60 / current.bpm) * current.spacing;
    }
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const source of sources) { try { source.stop(now()); } catch {} }
    for (const item of nodes) { try { item.disconnect(); } catch {} }
  }
  return Object.freeze({setChapter, setVolume, setActive, schedule, dispose, output});
}
