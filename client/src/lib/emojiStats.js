/**
 * A guest's personal emoji history — saved on this phone in localStorage.
 *
 * Two things are kept per guest:
 *   • counts + last-used times, so we can show their six most-used emoji
 *   • a short list of custom emoji they pasted, so they can reuse them
 *
 * This is deliberately NOT room state: it follows the person, not the party,
 * and survives refreshes and closed tabs. It also works without a guestId
 * (before joining) under a shared "anonymous" key.
 */

const PREFIX = 'ondu:emoji-stats:';
const TOP_LIMIT = 6;
const MAX_CUSTOM = 12;
const MAX_TRACKED = 200;

const blank = () => ({ counts: {}, lastUsed: {}, custom: [] });

function storageKey(guestId) {
  return `${PREFIX}${guestId || 'anonymous'}`;
}

function read(guestId) {
  if (typeof localStorage === 'undefined') return blank();
  try {
    const raw = localStorage.getItem(storageKey(guestId));
    if (!raw) return blank();
    const data = JSON.parse(raw);
    return {
      counts: data?.counts && typeof data.counts === 'object' ? data.counts : {},
      lastUsed: data?.lastUsed && typeof data.lastUsed === 'object' ? data.lastUsed : {},
      custom: Array.isArray(data?.custom) ? data.custom.slice(0, MAX_CUSTOM) : [],
    };
  } catch {
    return blank();
  }
}

function write(guestId, data) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(storageKey(guestId), JSON.stringify(data));
  } catch {
    // Private mode / quota — reactions still work, history just won't persist.
  }
}

/** [{ emoji, count }] — the six favourites, most used (then most recent) first. */
export function topEmojis(guestId, limit = TOP_LIMIT) {
  const { counts, lastUsed } = read(guestId);
  return Object.entries(counts)
    .map(([emoji, count]) => ({ emoji, count, used: lastUsed[emoji] || 0 }))
    .sort((a, b) => b.count - a.count || b.used - a.used)
    .slice(0, limit);
}

/** Record one sent reaction and return the refreshed Top 6. */
export function recordEmoji(guestId, emoji) {
  const value = String(emoji || '').trim();
  if (!value) return topEmojis(guestId);

  const data = read(guestId);
  data.counts[value] = (data.counts[value] || 0) + 1;
  data.lastUsed[value] = Date.now();

  // Stop a long night from creating an unbounded object.
  const keys = Object.keys(data.counts);
  if (keys.length > MAX_TRACKED) {
    const keep = keys
      .sort((a, b) => data.counts[b] - data.counts[a] || data.lastUsed[b] - data.lastUsed[a])
      .slice(0, MAX_TRACKED);
    const counts = {};
    const lastUsed = {};
    for (const key of keep) {
      counts[key] = data.counts[key];
      lastUsed[key] = data.lastUsed[key];
    }
    data.counts = counts;
    data.lastUsed = lastUsed;
  }

  write(guestId, data);
  return topEmojis(guestId);
}

/** The saved custom emoji, newest first. */
export function customEmojis(guestId) {
  return read(guestId).custom;
}

/** Save a pasted emoji for reuse (de-duplicated, capped at 12). */
export function saveCustomEmoji(guestId, emoji) {
  const value = String(emoji || '').trim();
  if (!value) return customEmojis(guestId);
  const data = read(guestId);
  data.custom = [value, ...data.custom.filter((item) => item !== value)].slice(0, MAX_CUSTOM);
  write(guestId, data);
  return data.custom;
}

/** Forget one saved custom emoji. */
export function removeCustomEmoji(guestId, emoji) {
  const data = read(guestId);
  data.custom = data.custom.filter((item) => item !== emoji);
  write(guestId, data);
  return data.custom;
}
