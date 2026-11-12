/**
 * Applause + airhorn, synthesized with the Web Audio API.
 *
 * Doing it in code means zero audio files to ship and nothing to license —
 * the sounds are royalty-free by construction.
 *
 * Browsers only allow audio after a user gesture, so the host screen calls
 * unlockAudio() from the "Start party" click. After that the TV can make
 * noise all night.
 */

let ctx = null;

/** Create/resume the AudioContext (call from a click handler). */
export function unlockAudio() {
  if (!ctx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    ctx = new AudioContextClass();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function noiseBuffer(context, seconds) {
  const buffer = context.createBuffer(1, context.sampleRate * seconds, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

/** A room full of clapping hands = a lot of short filtered noise bursts. */
export function playApplause() {
  const context = unlockAudio();
  if (!context) return;

  const now = context.currentTime;
  const master = context.createGain();
  master.gain.setValueAtTime(0.5, now);
  master.connect(context.destination);

  const noise = noiseBuffer(context, 0.4);

  for (let i = 0; i < 80; i += 1) {
    const t = now + Math.random() * 1.7; // when this clap lands
    const level = 0.2 + Math.random() * 0.5; // how loud
    const length = 0.05 + Math.random() * 0.08; // how long it rings

    const source = context.createBufferSource();
    source.buffer = noise;

    const band = context.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 800 + Math.random() * 2800; // every hand sounds different
    band.Q.value = 1.1;

    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0.0001, t);
    envelope.gain.exponentialRampToValueAtTime(level, t + 0.012);
    envelope.gain.exponentialRampToValueAtTime(0.0001, t + length);

    source.connect(band);
    band.connect(envelope);

    let tail = envelope;
    if (context.createStereoPanner) {
      const pan = context.createStereoPanner();
      pan.pan.value = Math.random() * 1.6 - 0.8; // spread the crowd around
      envelope.connect(pan);
      tail = pan;
    }
    tail.connect(master);

    source.start(t);
    source.stop(t + length + 0.05);
  }

  // The crowd settles instead of cutting off.
  master.gain.setValueAtTime(0.5, now + 1.5);
  master.gain.linearRampToValueAtTime(0.0001, now + 2.2);
}

/** Three stabs of a brass-ish horn. */
export function playAirhorn() {
  const context = unlockAudio();
  if (!context) return;

  const now = context.currentTime;
  const master = context.createGain();
  master.gain.value = 0.45;
  master.connect(context.destination);

  const stab = (start, hold) => {
    const t = now + start;
    const end = t + hold;

    for (const [frequency, type, level] of [
      [233, 'sawtooth', 0.5], // Bb3 — the body of the horn
      [466, 'square', 0.2], // Bb4 — the piercing top
    ]) {
      const osc = context.createOscillator();
      osc.type = type;
      // The signature airhorn scoop: start a bit flat, snap up to the note.
      osc.frequency.setValueAtTime(frequency * 0.92, t);
      osc.frequency.exponentialRampToValueAtTime(frequency, t + 0.06);
      if (hold > 0.4) osc.frequency.exponentialRampToValueAtTime(frequency * 0.97, end);

      const lowpass = context.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = 2400;

      const envelope = context.createGain();
      envelope.gain.setValueAtTime(0.0001, t);
      envelope.gain.exponentialRampToValueAtTime(level, t + 0.02);
      envelope.gain.setValueAtTime(level, end - 0.08);
      envelope.gain.exponentialRampToValueAtTime(0.0001, end + 0.06);

      osc.connect(lowpass);
      lowpass.connect(envelope);
      envelope.connect(master);

      osc.start(t);
      osc.stop(end + 0.1);
    }
  };

  stab(0, 0.18); // mwah
  stab(0.26, 0.18); // mwah
  stab(0.52, 0.62); // mwaaaah
}

/** Dispatch used by the host screen. */
export function playSound(type) {
  if (type === 'airhorn') playAirhorn();
  else playApplause();
}
