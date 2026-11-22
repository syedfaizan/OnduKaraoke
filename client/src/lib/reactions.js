/**
 * The reactions: the six classic emoji plus the six cat/dog memes.
 *
 * The meme ids and labels come from `shared/memes.js`; `gif` is the bundled
 * fallback served by the same Worker. When a GIPHY key is configured the phone
 * sends a GIPHY URL with the reaction and the TV uses that instead — with no
 * key, or no network, everything keeps working from the local files.
 *
 * Both kinds travel the same way (`reaction:send` → `reaction:burst`): an id
 * for a meme, the emoji itself for the classic set. The host screen renders
 * anything it doesn't recognise as plain text.
 */
import { MEME_REACTIONS } from '../../../shared/memes.js';

/** The original emoji reactions — quick, and they cost nothing to load. */
export const EMOJI_REACTIONS = ['❤️', '🔥', '👏', '😂', '🎤', '🎉'];

export const REACTIONS = MEME_REACTIONS.map(({ id, label }) => ({
  id,
  label,
  gif: `/gifs/${id}.gif`,
}));

export const REACTION_BY_ID = new Map(REACTIONS.map((reaction) => [reaction.id, reaction]));

/* A phone still running the previous deploy sends these ids — point them at
   the closest new meme instead of showing a bare word on the TV. */
const LEGACY_ALIASES = {
  doge: 'smiling-dog',
  'pop-cat': 'dancing-kitten',
  'keyboard-cat': 'dancing-dog',
  'grumpy-cat': 'crying-cat',
  'bongo-cat': 'scuba-cat',
  cheems: 'laughing-dog',
  'wow-dog': 'laughing-dog',
};

for (const [oldId, newId] of Object.entries(LEGACY_ALIASES)) {
  REACTION_BY_ID.set(oldId, REACTION_BY_ID.get(newId));
}
