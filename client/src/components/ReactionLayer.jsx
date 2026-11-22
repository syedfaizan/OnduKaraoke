import { useEffect, useRef } from 'react';
import { socket } from '../lib/realtime.js';

/** Text emoji are cheap — but still cap them so a wild crowd can't bury the video. */
const MAX_ON_SCREEN = 14;

/**
 * Floating reactions on the host screen. Every reaction is just text now, so
 * any emoji works — classic, picked from the catalogue or pasted by a guest —
 * with nothing to preload and no image CDN to wait on.
 *
 * Nodes are created directly in the DOM (no React re-render per reaction) —
 * that keeps the TV smooth when the crowd goes wild.
 */
export default function ReactionLayer({ spread = false }) {
  const layer = useRef(null);
  // Read the latest prop inside the socket handler without re-subscribing.
  const spreadRef = useRef(spread);
  spreadRef.current = spread;

  useEffect(() => {
    const spawn = ({ emoji }) => {
      const container = layer.current;
      if (!container) return;

      // Cap the number on screen — drop the oldest one.
      while (container.children.length >= MAX_ON_SCREEN) {
        container.firstChild?.remove();
      }

      const node = document.createElement('span');
      node.className = 'reaction';
      node.textContent = String(emoji || '❤️').slice(0, 16);
      node.style.fontSize = `${44 + Math.random() * 42}px`;

      /*
       * Minimal mode with the video on screen: reactions fly over the player.
       * Otherwise they only float up the two side gutters so the lyrics stay
       * readable.
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
      node.style.animationDuration = `${3.2 + Math.random() * 1.2}s`;
      node.addEventListener('animationend', () => node.remove());

      container.appendChild(node);
    };

    socket.on('reaction:burst', spawn);
    return () => socket.off('reaction:burst', spawn);
  }, []);

  return <div className="reaction-layer" ref={layer} aria-hidden="true" />;
}
