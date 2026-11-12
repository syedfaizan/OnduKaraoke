import confetti from 'canvas-confetti';

/** The Ondu palette — every burst uses these colours. */
export const NEON_COLORS = ['#ff2ec4', '#00e5ff', '#a855ff', '#ffffff', '#ffe14d'];

/** Fired when a song finishes (and for big moments). */
export function confettiBurst() {
  confetti({
    particleCount: 150,
    spread: 110,
    startVelocity: 45,
    origin: { y: 0.55 },
    colors: NEON_COLORS,
    scalar: 1.05,
  });

  // Side cannons for a bit of drama.
  const end = Date.now() + 1100;
  const frame = () => {
    confetti({
      particleCount: 5,
      angle: 60,
      spread: 60,
      origin: { x: 0, y: 0.7 },
      colors: NEON_COLORS,
    });
    confetti({
      particleCount: 5,
      angle: 120,
      spread: 60,
      origin: { x: 1, y: 0.7 },
      colors: NEON_COLORS,
    });
    if (Date.now() < end) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

/** Bigger, longer celebration for the night summary. */
export function confettiCelebration() {
  confettiBurst();
  setTimeout(confettiBurst, 400);
  setTimeout(confettiBurst, 800);
}
