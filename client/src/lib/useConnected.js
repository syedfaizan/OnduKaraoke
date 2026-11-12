import { useEffect, useState } from 'react';
import { socket } from './realtime.js';

/** True while the socket is connected — buttons wait for it instead of hanging. */
export function useConnected() {
  const [connected, setConnected] = useState(socket.connected);

  useEffect(() => {
    const on = () => setConnected(true);
    const off = () => setConnected(false);
    socket.on('connect', on);
    socket.on('disconnect', off);
    return () => {
      socket.off('connect', on);
      socket.off('disconnect', off);
    };
  }, []);

  return connected;
}
