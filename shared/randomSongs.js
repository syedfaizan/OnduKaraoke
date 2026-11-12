/**
 * Ondu Karaoke — language presets for the "Random" tab.
 * Each one is fed through the normal karaoke search pipeline (embeddable,
 * music category, karaoke-channel boost, 24h cache).
 */
export const RANDOM_LANGUAGES = [
  { key: 'english', label: 'English', emoji: '🇬🇧', query: 'popular karaoke songs' },
  { key: 'hindi', label: 'Hindi', emoji: '🇮🇳', query: 'popular hindi karaoke' },
  { key: 'kannada', label: 'Kannada', emoji: '🇮🇳', query: 'kannada karaoke hits' },
];

export function languageByKey(key) {
  return RANDOM_LANGUAGES.find((lang) => lang.key === String(key || '').toLowerCase()) || null;
}
