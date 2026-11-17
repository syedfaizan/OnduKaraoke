import { useEffect, useRef } from 'react';
import { socket } from '../lib/realtime.js';
import { REACTIONS, REACTION_BY_ID } from '../lib/reactions.js';

/** How many GIFs may float at the same time (animated GIFs are heavy). */
const MAX_ON_SCREEN = 10;

/**
 * Floating cat/dog GIF reactions on the host screen.
 *
 * Nodes are created directly in the DOM (no React re-render per reaction) —
 * that keeps the TV smooth when the crowd goes wild. An unknown payload falls
 * back to plain text, so phones on an older deploy still send something.
 */
export default function ReactionLayer() {
  const layer = useRef(null);

  useEffect(() => {
    // Warm the cache once so the first reaction doesn't pop in half-loaded.
    for (const { gif } of REACTIONS) {
      const preload = new Image();
      preload.src = gif;
    }

    const spawn = ({ emoji }) => {
      const container = layer.current;
      if (!container) return;

      // Cap the number on screen — drop the oldest one.
      while (container.children.length >= MAX_ON_SCREEN) {
        container.firstChild?.remove();
      }

      const reaction = REACTION_BY_ID.get(emoji);
      let node;

      if (reaction) {
        node = document.createElement('img');
        node.src = reaction.gif;
        node.alt = '';
        node.className = 'reaction reaction-gif';
        node.style.width = `clamp(72px, ${5.5 + Math.random() * 4.5}vw, 200px)`;
      } else {
        node = document.createElement('span');
        node.className = 'reaction';
        node.textContent = emoji;
        node.style.fontSize = `${44 + Math.random() * 42}px`;
      }

      // Memes only float up the two side gutters so the middle of the TV (the
      // video and the lyrics) always stays readable. At the animation's peak
      // 1.45x scale plus a ±15deg tilt a 10vw GIF grows ~8.9vw either side of
      // its centre, so these bands end by ~19vw and start at ~81vw — the
      // lyrics text runs from about 19vw to 76vw on a 16:9 screen.
      node.style.left =
        Math.random() < 0.5
          ? `${2 + Math.random() * 3}vw` // 2–5vw  → right edge ≤ ~19vw
          : `${85 + Math.random() * 3}vw`; // 85–88vw → left edge ≥ ~81vw
      node.style.setProperty('--tilt', `${Math.random() * 30 - 15}deg`);
      // 2s longer than the old emoji float so each meme has time to land.
      node.style.animationDuration = `${5.1 + Math.random() * 1.2}s`;
      node.addEventListener('animationend', () => node.remove());

      container.appendChild(node);
    };

    socket.on('reaction:burst', spawn);
    return () => socket.off('reaction:burst', spawn);
  }, []);

  return <div className="reaction-layer" ref={layer} aria-hidden="true" />;
}
