/**
 * Ondu Karaoke — persistent sessions.
 *
 * These live in **localStorage** (not sessionStorage) so they survive:
 *   • pressing "back" in the browser,
 *   • closing the tab / locking the phone,
 *   • reopening the app hours later.
 *
 * Every entry carries an expiry — sessions live for 6 hours, then they are
 * dropped so a forgotten device does not linger in the room forever.
 */

const SESSION_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

const HOST_KEY = 'ondu:host-session';
const NAME_KEY = 'ondu:last-name';
const guestKey = (roomCode) => `ondu:guest:${roomCode}`;

function write(key, data) {
  try {
    localStorage.setItem(
      key,
      JSON.stringify({ ...data, expiresAt: Date.now() + SESSION_TTL_MS }),
    );
  } catch {
    // Private mode / quota — the app still works, the session just won't persist.
  }
}

function read(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;

    const data = JSON.parse(raw);
    if (!data || !data.expiresAt || data.expiresAt < Date.now()) {
      localStorage.removeItem(key);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function drop(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

/* ------------------------------------------------------------------ */
/* Host screen                                                         */
/* ------------------------------------------------------------------ */

/** { roomCode, hostToken, hostPassword } */
export function saveHostSession(data) {
  write(HOST_KEY, data);
}

export function loadHostSession() {
  return read(HOST_KEY);
}

export function clearHostSession() {
  drop(HOST_KEY);
}

/* ------------------------------------------------------------------ */
/* Phones                                                              */
/* ------------------------------------------------------------------ */

/** { guestId, name } — per room */
export function saveGuestSession(roomCode, data) {
  write(guestKey(roomCode), data);
}

export function loadGuestSession(roomCode) {
  return read(guestKey(roomCode));
}

export function clearGuestSession(roomCode) {
  drop(guestKey(roomCode));
}

/* ------------------------------------------------------------------ */
/* Convenience                                                         */
/* ------------------------------------------------------------------ */

/** The last name this guest typed — prefills the join form. */
export function saveLastName(name) {
  write(NAME_KEY, { name });
}

export function loadLastName() {
  return read(NAME_KEY)?.name || '';
}

/** How long is left on the stored session (ms) — for the "session expires" hint. */
export function sessionTimeLeft(key) {
  const data = read(key);
  return data ? Math.max(0, data.expiresAt - Date.now()) : 0;
}
