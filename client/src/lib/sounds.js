/**
 * Applause, played from a real recording.
 *
 * The clip is a 3.2-second excerpt of a public-domain applause recording
 * (pdsounds.org, via Wikimedia Commons) shipped in `client/public/sounds`, so
 * there is nothing to license and no third-party request at party time.
 *
 * Browsers only allow audio after a user gesture, so the host screen calls
 * unlockAudio() from the "Start party" click. Safari needs that gesture to
 * happen on the same element that plays later, which is why we warm up the
 * real element instead of creating a throwaway one.
 */

const APPLAUSE_SRC = '/sounds/applause.m4a';

let applause = null;
let priming = null;

function applauseAudio() {
  if (typeof Audio === 'undefined') return null;
  if (!applause) {
    applause = new Audio(APPLAUSE_SRC);
    applause.preload = 'auto';
    applause.volume = 0.85;
  }
  return applause;
}

/** Prime the audio element (call from a click handler). */
export function unlockAudio() {
  const audio = applauseAudio();
  if (!audio || priming) return;

  audio.muted = true;
  priming = audio.play();

  const settle = () => {
    audio.pause();
    audio.currentTime = 0;
    audio.muted = false;
    priming = null;
  };

  if (priming?.then) {
    priming.then(settle).catch(() => {
      audio.muted = false;
      priming = null;
    });
  } else {
    settle();
  }
}

/** A round of applause for the singer. */
export function playApplause() {
  const audio = applauseAudio();
  if (!audio) return;

  try {
    audio.currentTime = 0;
    audio.muted = false;
    const result = audio.play();
    if (result?.catch) result.catch(() => {});
  } catch {
    // Nothing to do — the next click will unlock it.
  }
}

/** Dispatch used by the host screen. */
export function playSound() {
  playApplause();
}
