/**
 * Pure checks for the emoji catalogue + personal Top 5 — no browser required.
 *
 *   npm run smoke:emojis
 */

import { CLASSIC_EMOJIS, EMOJI_CATEGORIES, cleanCustomEmoji, searchEmojis } from '../../client/src/lib/emojis.js';
import {
  customEmojis,
  recordEmoji,
  removeCustomEmoji,
  saveCustomEmoji,
  topEmojis,
} from '../../client/src/lib/emojiStats.js';

const store = new Map();
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
};

let failures = 0;
function check(label, condition, extra = '') {
  if (condition) {
    console.log(`  ✓ ${label}`);
  } else {
    failures += 1;
    console.log(`  ✗ ${label}${extra ? ` → ${extra}` : ''}`);
  }
}

console.log('\n· emoji catalogue');
check('six classic one-tap emoji', CLASSIC_EMOJIS.length === 6);
check('categories are populated', EMOJI_CATEGORIES.length >= 6 && EMOJI_CATEGORIES.every((c) => c.icon && c.emojis.length));
const unique = new Set(EMOJI_CATEGORIES.flatMap((c) => c.emojis.map(([emoji]) => emoji)));
check('at least 60 distinct emoji', unique.size >= 60, String(unique.size));
check('every entry has search keywords', EMOJI_CATEGORIES.every((c) => c.emojis.every(([, words]) => words)));
check('search by keyword', searchEmojis('love').includes('❤️') && searchEmojis('cat').includes('🐱'));
check('search by emoji itself', searchEmojis('🪩').includes('🪩'));
check('empty and unknown searches', searchEmojis('').length === 0 && searchEmojis('qwertyqwerty').length === 0);

console.log('\n· custom emoji input');
check('a single emoji is accepted', cleanCustomEmoji(' 🪩 ') === '🪩');
check('a few emoji are accepted', cleanCustomEmoji('🔥🔥') === '🔥🔥');
check('flags and keycaps are accepted', cleanCustomEmoji('🇮🇳') === '🇮🇳' && cleanCustomEmoji('1️⃣') === '1️⃣');
check('words are rejected', cleanCustomEmoji('hello') === '' && cleanCustomEmoji('🔥 party') === '');
check('long strings are rejected', cleanCustomEmoji('🔥'.repeat(11)) === '');

console.log('\n· personal Top 5');
check('a new guest has no history', topEmojis('ravi').length === 0);
recordEmoji('ravi', '🔥');
recordEmoji('ravi', '🔥');
recordEmoji('ravi', '😂');
recordEmoji('ravi', '🪩');
recordEmoji('ravi', '🪩');
recordEmoji('ravi', '🪩');
const top = topEmojis('ravi');
check('sorted by usage', top[0].emoji === '🪩' && top[0].count === 3, JSON.stringify(top));
check('counts are kept', top[1].emoji === '🔥' && top[1].count === 2);
check('limited to five', topEmojis('ravi', 2).length === 2 && top.length <= 5);
check('another guest has separate history', topEmojis('asha').length === 0);
check('saved to localStorage', store.has('ondu:emoji-stats:ravi'));
recordEmoji('ravi', '🎉');
recordEmoji('ravi', '❤️');
recordEmoji('ravi', '👍');
recordEmoji('ravi', '🎤');
recordEmoji('ravi', '🙏');
check('still only five after a long night', topEmojis('ravi').length === 5);

console.log('\n· custom emoji saved for reuse');
for (let i = 0; i < 14; i += 1) saveCustomEmoji('asha', String.fromCodePoint(0x1f300 + i));
check('capped at twelve', customEmojis('asha').length === 12);
check('newest first', customEmojis('asha')[0] === String.fromCodePoint(0x1f30d));
saveCustomEmoji('asha', '🪩');
check('de-duplicated', customEmojis('asha').filter((emoji) => emoji === '🪩').length === 1);
check('removable', !removeCustomEmoji('asha', '🪩').includes('🪩'));

console.log(`\n${failures ? `✗ ${failures} check(s) failed` : '✓ all emoji checks passed'}\n`);
process.exit(failures ? 1 : 0);
