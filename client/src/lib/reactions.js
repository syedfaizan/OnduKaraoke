/**
 * The six reaction memes.
 *
 * The GIFs live in `client/public/gifs` and are served by the same Worker as
 * the app — the TV never waits on a third-party CDN, and a party doesn't stop
 * working when someone's favourite GIF host goes down. They were downscaled to
 * 170px and re-paletted so six animations stay light on the TV.
 *
 * `id` travels over the socket (`reaction:send` → `reaction:burst`). Old phones
 * that still send an emoji keep working: the host screen falls back to text.
 */
export const REACTIONS = [
  { id: 'scuba-cat', gif: '/gifs/scuba-cat.gif', label: 'Scuba Cat' },
  { id: 'smiling-dog', gif: '/gifs/smiling-dog.gif', label: 'Smiling Dog' },
  { id: 'dancing-kitten', gif: '/gifs/dancing-kitten.gif', label: 'Dancing Kitten' },
  { id: 'dancing-dog', gif: '/gifs/dancing-dog.gif', label: 'Dancing Dog' },
  { id: 'crying-cat', gif: '/gifs/crying-cat.gif', label: 'Crying Cat' },
  { id: 'wow-dog', gif: '/gifs/wow-dog.gif', label: 'Wow Dog' },
];

export const REACTION_BY_ID = new Map(REACTIONS.map((reaction) => [reaction.id, reaction]));

/* A phone still running the previous deploy sends these ids — point them at
   the closest new meme instead of showing a bare word on the TV. */
const LEGACY_ALIASES = {
  doge: 'smiling-dog',
  'pop-cat': 'dancing-kitten',
  'keyboard-cat': 'dancing-dog',
  'grumpy-cat': 'crying-cat',
  'bongo-cat': 'scuba-cat',
  cheems: 'wow-dog',
};

for (const [oldId, newId] of Object.entries(LEGACY_ALIASES)) {
  REACTION_BY_ID.set(oldId, REACTION_BY_ID.get(newId));
}
