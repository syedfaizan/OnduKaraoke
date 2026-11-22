/**
 * The emoji catalogue for the phone controller.
 *
 * There are no GIFs any more: every reaction is a piece of text, so the TV
 * can render any emoji a guest picks — including ones pasted into the custom
 * field — without loading an image or knowing the emoji in advance.
 */

/** The six one-tap classics, kept from the original app. */
export const CLASSIC_EMOJIS = ['❤️', '🔥', '👏', '😂', '🎤', '🎉'];

/**
 * A small, searchable catalogue for the "More emojis" picker. Keywords are
 * plain English so guests can type "love", "dance" or "cat" instead of hunting.
 */
export const EMOJI_CATEGORIES = [
  {
    name: 'Smileys',
    icon: '😀',
    emojis: [
      ['😀', 'grin happy smile'], ['😃', 'happy smile'], ['😄', 'laugh happy'],
      ['😁', 'grin beam'], ['😆', 'laugh squint'], ['😅', 'sweat laugh'],
      ['🤣', 'rofl laugh floor'], ['😂', 'laugh cry tears joy'], ['🙂', 'smile'],
      ['🙃', 'upside down silly'], ['😉', 'wink'], ['😊', 'smile blush'],
      ['😇', 'angel halo'], ['🥰', 'love hearts smile'], ['😍', 'love heart eyes'],
      ['🤩', 'star struck wow'], ['😘', 'kiss'], ['😎', 'cool sunglasses'],
      ['🤯', 'mind blown shock'], ['😭', 'cry sob sad'], ['😴', 'sleep tired'],
      ['🤔', 'think thinking'], ['😱', 'scream fear'], ['🥳', 'party celebrate'],
    ],
  },
  {
    name: 'Hands',
    icon: '🙌',
    emojis: [
      ['👍', 'like thumbs up yes'], ['👎', 'dislike thumbs down no'],
      ['👏', 'applause clap bravo'], ['🙌', 'raise hands celebrate'],
      ['👋', 'wave hello bye'], ['🤝', 'handshake deal'], ['🙏', 'thanks please pray'],
      ['💪', 'strong muscle flex'], ['✌️', 'peace victory'], ['🤞', 'fingers crossed luck'],
      ['🤟', 'love you rock'], ['🤘', 'rock horns'], ['👌', 'ok perfect'],
      ['👀', 'eyes look watch'], ['🫶', 'heart hands love'],
    ],
  },
  {
    name: 'Hearts',
    icon: '❤️',
    emojis: [
      ['❤️', 'love red heart'], ['🧡', 'orange heart'], ['💛', 'yellow heart'],
      ['💚', 'green heart'], ['💙', 'blue heart'], ['💜', 'purple heart'],
      ['🖤', 'black heart'], ['🤍', 'white heart'], ['🤎', 'brown heart'],
      ['💔', 'broken heart sad'], ['💖', 'sparkling heart'], ['💗', 'growing heart'],
      ['💓', 'beating heart'], ['💕', 'two hearts love'], ['💞', 'revolving hearts'],
      ['💝', 'gift heart'], ['❣️', 'heart exclamation'],
    ],
  },
  {
    name: 'Party',
    icon: '🎉',
    emojis: [
      ['🎉', 'party celebrate confetti'], ['🎊', 'confetti celebrate'],
      ['🎈', 'balloon party'], ['🎁', 'gift present'], ['🎂', 'birthday cake'],
      ['🍾', 'champagne celebrate'], ['🥂', 'cheers toast glasses'],
      ['🍻', 'cheers beers'], ['🎤', 'microphone sing karaoke'],
      ['🎧', 'headphones music'], ['🎶', 'music notes song'], ['🎵', 'music note song'],
      ['🎸', 'guitar rock'], ['🥳', 'party face celebrate'], ['✨', 'sparkle shine magic'],
      ['🌟', 'star glow'], ['⭐', 'star'], ['💫', 'dizzy star'],
      ['🪩', 'disco ball dance'], ['🎬', 'movie camera'],
    ],
  },
  {
    name: 'Animals',
    icon: '🐶',
    emojis: [
      ['🐶', 'dog puppy'], ['🐱', 'cat kitten'], ['🐭', 'mouse'], ['🐹', 'hamster'],
      ['🐰', 'rabbit bunny'], ['🦊', 'fox'], ['🐻', 'bear'], ['🐼', 'panda'],
      ['🐨', 'koala'], ['🐯', 'tiger'], ['🦁', 'lion'], ['🐮', 'cow'],
      ['🐷', 'pig'], ['🐸', 'frog'], ['🐵', 'monkey'], ['🐔', 'chicken'],
      ['🐧', 'penguin'], ['🦄', 'unicorn magic'], ['🐝', 'bee'], ['🦋', 'butterfly'],
    ],
  },
  {
    name: 'Food',
    icon: '🍕',
    emojis: [
      ['🍕', 'pizza'], ['🍔', 'burger'], ['🍟', 'fries'], ['🌮', 'taco'],
      ['🍣', 'sushi'], ['🍜', 'noodles ramen'], ['🍦', 'ice cream'],
      ['🍰', 'cake slice'], ['🍩', 'donut'], ['🍪', 'cookie'], ['☕', 'coffee tea'],
      ['🍺', 'beer'], ['🧋', 'bubble tea'], ['🥤', 'drink soda'],
      ['🍓', 'strawberry'], ['🍎', 'apple'], ['🍇', 'grapes'],
    ],
  },
  {
    name: 'Hype',
    icon: '🔥',
    emojis: [
      ['🔥', 'fire lit hot'], ['💯', 'hundred perfect score'], ['🏆', 'trophy win winner'],
      ['🥇', 'gold medal first'], ['👑', 'crown queen king'], ['✅', 'check yes done'],
      ['🚀', 'rocket launch'], ['⚡', 'lightning fast'], ['💥', 'boom explosion'],
      ['🎯', 'target bullseye'], ['📣', 'megaphone shout announce'], ['🌈', 'rainbow'],
      ['☀️', 'sun sunny'], ['🌙', 'moon night'], ['🍀', 'clover luck'],
      ['💜', 'purple heart love'], ['😍', 'love heart eyes'], ['🤩', 'star struck wow'],
    ],
  },
];

/** Flat, de-duplicated list for search results. */
const ALL_EMOJIS = EMOJI_CATEGORIES.flatMap((category) => category.emojis);

/** Find emoji by English keyword (or by the emoji itself). */
export function searchEmojis(query) {
  const term = String(query || '').trim().toLowerCase();
  if (!term) return [];
  const seen = new Set();
  const results = [];
  for (const [emoji, keywords] of ALL_EMOJIS) {
    if (seen.has(emoji)) continue;
    if (emoji.includes(term) || keywords.includes(term)) {
      seen.add(emoji);
      results.push(emoji);
    }
  }
  return results;
}

/**
 * Tidy up a pasted custom reaction. Accepts only emoji-ish characters — no
 * words or sentences — and keeps the payload comfortably under the server's
 * 16-character limit. Returns '' when there's nothing worth sending.
 */
export function cleanCustomEmoji(input) {
  const value = String(input || '').trim();
  if (!value || [...value].length > 10) return '';
  const hasEmoji =
    /\p{Extended_Pictographic}/u.test(value) ||
    /\p{Regional_Indicator}{2}/u.test(value) || // 🇮🇳 and friends
    /\d\uFE0F\u20E3/u.test(value); // 1️⃣ and friends
  if (!hasEmoji || /[A-Za-z\s]/.test(value)) return '';
  return value;
}
