import { useEffect, useRef } from 'react';
import { socket } from '../lib/realtime.js';
import { REACTIONS, REACTION_BY_ID } from '../lib/reactions.js';

/** How many GIFs may float at the same time (animated GIFs are heavy). */
const MAX_ON_SCREEN = 10;

/**
 * Floating reactions on the host screen: the six cat/dog GIFs plus plain-text
 * emoji from the classic reaction set.
 *
 * Nodes are created directly in the DOM (no React re-render per reaction) —
 * that keeps the TV smooth when the crowd goes wild. An unknown payload falls
 * back to text, so phones on an older deploy still send something.
 */
export default function ReactionLayer({ spread = false }) {
  const layer = useRef(null);
  // Read the latest prop inside the socket handler without re-subscribing.
  const spreadRef = useRef(spread);
  spreadRef.current = spread;

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

      /*
       * Minimal mode with the video on screen: the memes may fly anywhere
       * (over the player — that's half the fun). Otherwise they only float up
       * the two side gutters so the lyrics stay readable.
       */
      if (spreadRef.current) {
        node.style.left = `${3 + Math.random() * 79}vw`;
      } else {
        node.style.left =
          Math.random() < 0.5
            ? `${2 + Math.random() * 3}vw` // 2–5vw  → right edge ≤ ~19vw
            : `${85 + Math.random() * 3}vw`; // 85–88vw → left edge ≥ ~81vw
      }
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
