/**
 * The QR code has to point at a URL that phones on the party Wi-Fi can reach.
 *
 * If the host screen is opened on localhost (the usual "TV = my laptop"
 * setup) we ask the backend for this machine's LAN address and swap it in.
 * If it is already opened via the LAN address we simply use the origin.
 */

import { apiUrl } from './config.js';

let cached = null;

export function joinBaseUrl() {
  if (cached) return Promise.resolve(cached);

  cached = (async () => {
    const { protocol, hostname, port, origin } = window.location;

    const isLocal = !hostname || hostname === 'localhost' || hostname === '127.0.0.1';
    if (!isLocal) return origin;

    try {
      const response = await fetch(apiUrl('/api/lan-url'));
      const { ip } = await response.json();
      if (ip) return `${protocol}//${ip}${port ? `:${port}` : ''}`;
    } catch {
      // Backend unreachable — fall back to whatever we have.
    }

    return origin;
  })();

  return cached;
}
