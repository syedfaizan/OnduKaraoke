import { useCallback, useEffect, useRef, useState } from 'react';

/** Tiny toast queue used for "Added to the queue 🎤" style feedback. */
export function useToast() {
  const [toasts, setToasts] = useState([]);
  const timers = useRef([]);

  const show = useCallback((message, tone = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((list) => [...list.slice(-2), { id, message, tone }]);

    const timer = setTimeout(() => {
      setToasts((list) => list.filter((toast) => toast.id !== id));
    }, 3400);
    timers.current.push(timer);
  }, []);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  return { toasts, show };
}
