// Original, sparse soft-key composition. Every note ends; there is no drone,
// detuning, modulation, noise bed, delay feedback or continuous audible layer.
const profile = (notes, positions = [0, 2, 4]) => Object.freeze({
  bpm: 52,
  motif: Object.freeze(Array.from({length: 12}, (_, beat) => {
    const index = positions.indexOf(beat);
    return index < 0 ? null : notes[index];
  }))
});
export const pitchScoreProfiles = Object.freeze({
  opening: profile([62, 69, 66]),
  thesis: profile([62, 66, 64]),
  fleet: profile([66, 69, 62]),
  power: profile([62, 64, 69]),
  'site-rights': profile([57, 62, 64]),
  commercial: profile([62, 66], [0, 3]),
  'founder-capital': profile([59, 66], [0, 3]),
  cooling: profile([69, 66, 64]),
  'funding-bridge': profile([62, 64], [0, 3]),
  delivery: profile([64, 66, 69]),
  team: profile([59, 62, 66]),
  investment: profile([57, 64], [0, 3]),
  'next-steps': profile([62, 66, 69])
});
export const pitchScoreChapterIds = Object.freeze(Object.keys(pitchScoreProfiles));
const frequency = midi => 440 * 2 ** ((midi - 69) / 12);
const clamp = (value, fallback) => Number.isFinite(Number(value)) ? Math.max(0, Math.min(1, Number(value))) : fallback;

export function createPitchScore(context, {volume = .35, chapter = 'opening'} = {}) {
  if (!context?.createGain || !context?.createOscillator) throw new TypeError('A Web Audio context is required.');
  const nodes = [], sources = [];
  const node = value => { nodes.push(value); return value; };
  const gain = value => { const g = node(context.createGain()); g.gain.value = value; return g; };
  const now = () => Math.max(0, context.currentTime);
  const time = at => Number.isFinite(Number(at)) ? Math.max(now(), Number(at)) : now();
  let disposed = false, active = false, volumeValue = clamp(volume, .35);
  let currentId = Object.hasOwn(pitchScoreProfiles, chapter) ? chapter : 'opening';
  let current = pitchScoreProfiles[currentId], noteIndex = 0, voiceIndex = 0, nextNote = now() + .25;
  const ramps = new WeakMap();
  function ramp(param, target, at, seconds) {
    const r = ramps.get(param);
    const from = !r ? param.value : at <= r.start ? r.from : at >= r.end ? r.to : r.from + (r.to-r.from)*(at-r.start)/(r.end-r.start);
    if (typeof param.cancelAndHoldAtTime === 'function') param.cancelAndHoldAtTime(at);
    else param.cancelScheduledValues(at);
    param.setValueAtTime(from, at); param.linearRampToValueAtTime(target, at+seconds);
    ramps.set(param, {from, to:target, start:at, end:at+seconds});
  }
  const mix = gain(1), filter = node(context.createBiquadFilter());
  filter.type = 'lowpass'; filter.frequency.value = 1600; filter.Q.value = .45;
  const level = gain(volumeValue), output = gain(0);
  mix.connect(filter); filter.connect(level); level.connect(output); output.connect(context.destination);

  // Reusable voices stay at exactly zero between finite notes. A very quiet
  // second harmonic dies first, giving each key a rounded, piano-like decay.
  const voices = Array.from({length: 4}, (_, i) => {
    const panner = node(context.createStereoPanner()); panner.pan.value = [-.12,.12,-.06,.06][i]; panner.connect(mix);
    const parts = [1,2].map(part => {
      const envelope = gain(0), oscillator = node(context.createOscillator());
      oscillator.type = 'sine'; oscillator.frequency.value = frequency(62)*part;
      oscillator.connect(envelope); envelope.connect(panner); oscillator.start(now()); sources.push(oscillator);
      return {oscillator, envelope};
    });
    return {parts, start:-1};
  });
  function silenceVoice(voice, at, fade = .18) {
    for (const {oscillator,envelope} of voice.parts) {
      const param = envelope.gain;
      if (typeof param.cancelAndHoldAtTime === 'function') param.cancelAndHoldAtTime(at);
      else {const value=param.value; param.cancelScheduledValues(at); param.setValueAtTime(value,at);}
      param.linearRampToValueAtTime(0, at+fade); oscillator.frequency.cancelScheduledValues(at);
    }
  }
  function setChapter(id, at = context.currentTime) {
    if (disposed) return;
    const nextId = Object.hasOwn(pitchScoreProfiles,id) ? id : 'opening';
    if (nextId === currentId) return;
    const t = time(at);
    // Let sounding notes finish. Cancel only queued notes; navigation never
    // restarts a phrase or adds a flourish, even when many chapters are skipped.
    for (const voice of voices) if (voice.start > t) silenceVoice(voice,t);
    currentId = nextId; current = pitchScoreProfiles[nextId];
  }
  function setVolume(value, at = context.currentTime) {
    if (disposed) return;
    volumeValue = clamp(value, volumeValue); ramp(level.gain,volumeValue,time(at),.18);
  }
  function setActive(value, at = context.currentTime) {
    if (disposed || Boolean(value) === active) return;
    const t = time(at); active = Boolean(value);
    ramp(output.gain,active ? 1 : 0,t,active ? .35 : .25);
    for (const voice of voices) silenceVoice(voice,t);
    noteIndex = 0; nextNote = t+.25;
  }
  function schedule(untilTime) {
    if (disposed || !active || !Number.isFinite(untilTime)) return;
    const t = now(), end = Math.min(untilTime,t+600);
    if (nextNote < t) nextNote = t+.025;
    let count = 0;
    while (nextNote < end && count++ < 4096) {
      const midi = current.motif[noteIndex % current.motif.length];
      if (midi !== null) {
        const voice = voices[voiceIndex++ % voices.length], start = nextNote;
        voice.start = start;
        voice.parts.forEach(({oscillator,envelope},part) => {
          oscillator.frequency.setValueAtTime(frequency(midi)*(part+1),start);
          const param = envelope.gain;
          param.setValueAtTime(0,start);
          param.linearRampToValueAtTime((part ? .021 : .28)*(noteIndex === 0 ? 1 : .86),start+(part ? .035 : .065));
          param.exponentialRampToValueAtTime(.000001,start+(part ? .6 : 2.1));
          param.linearRampToValueAtTime(0,start+(part ? .7 : 2.3));
        });
      }
      noteIndex++; nextNote += 60/current.bpm;
    }
  }
  function dispose() {
    if (disposed) return; disposed = true;
    for (const source of sources) {try {source.stop(now());} catch {}}
    for (const item of nodes) {try {item.disconnect();} catch {}}
  }
  return Object.freeze({setChapter,setVolume,setActive,schedule,dispose,output});
}
