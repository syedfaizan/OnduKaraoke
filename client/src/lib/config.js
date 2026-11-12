/**
 * Where the backend lives.
 *
 * • Same-origin (default): the Express server serves the built frontend and
 *   the API together — nothing to configure.
 * • Split (Vercel + a persistent backend): set VITE_API_URL / VITE_BACKEND_URL
 *   at build time and the frontend talks to that host directly.
 *
 * Both variables are baked into the bundle at build time (Vite), so on Vercel
 * they are set as project environment variables.
 */

const trim = (value) => String(value || '').replace(/\/+$/, '');

/** Base URL of the REST API ("" = same origin). */
export const API_BASE = trim(import.meta.env.VITE_API_URL);

/** Origin of the Socket.IO server ("" = same origin). */
export const SOCKET_BASE = trim(import.meta.env.VITE_BACKEND_URL);

/** Build an absolute API URL. */
export function apiUrl(path = '') {
  return `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
}

/** Build an absolute websocket URL. */
export function socketUrl() {
  return SOCKET_BASE || undefined;
}
