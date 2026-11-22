/**
 * The meme reactions, shared by the phones, the TV and the backend.
 *
 * `id` is what travels over the socket. `query` is the GIPHY search term the
 * phone uses to pick a GIF for that button. If GIPHY is not configured — or
 * briefly unavailable — the client keeps using the self-hosted GIF with the
 * same id, so a party never loses a meme.
 */

export const MEME_REACTIONS = [
  { id: 'scuba-cat', label: 'Scuba Cat', query: 'scuba cat' },
  { id: 'smiling-dog', label: 'Smiling Dog', query: 'smiling dog' },
  { id: 'dancing-kitten', label: 'Dancing Kitten', query: 'dancing cat' },
  { id: 'dancing-dog', label: 'Dancing Dog', query: 'dancing dog' },
  { id: 'crying-cat', label: 'Crying Cat', query: 'crying cat' },
  { id: 'laughing-dog', label: 'Laughing Dog', query: 'laughing dog' },
];

/**
 * Only images from GIPHY's media CDN may ride along on a reaction. Clients
 * send a URL with the reaction; without this check anybody could point the TV
 * at an arbitrary image (or a tracking pixel) just by joining the room.
 */
export function isGiphyMediaUrl(value) {
  if (typeof value !== 'string' || value.length > 300) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      /^media\d*\.giphy\.com$/i.test(url.hostname) &&
      url.pathname.startsWith('/media/')
    );
  } catch {
    return false;
  }
}
