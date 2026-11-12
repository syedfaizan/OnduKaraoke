import { useEffect, useRef } from 'react';
import { socket } from '../lib/realtime.js';

/** How many emoji may float at the same time (keeps the TV smooth). */
const MAX_ON_SCREEN = 30;

/**
 * Floating emoji reactions on the host screen.
 *
 * The nodes are created directly in the DOM (no React re-render per emoji) —
 * that keeps things smooth when the crowd goes wild.
 */
export default function ReactionLayer() {
  const layer = useRef(null);

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
      node.textContent = emoji;
      node.style.left = `${4 + Math.random() * 90}vw`;
      node.style.fontSize = `${44 + Math.random() * 42}px`;
      node.style.setProperty('--tilt', `${Math.random() * 44 - 22}deg`);
      node.style.animationDuration = `${2.6 + Math.random() * 1.1}s`;
      node.addEventListener('animationend', () => node.remove());

      container.appendChild(node);
    };

    socket.on('reaction:burst', spawn);
    return () => socket.off('reaction:burst', spawn);
  }, []);

  return <div className="reaction-layer" ref={layer} aria-hidden="true" />;
}
