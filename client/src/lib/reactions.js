/**
 * The six reaction memes.
 *
 * The GIFs live in `client/public/gifs` and are served by the same Worker as
 * the app — the TV never waits on a third-party CDN, and a party doesn't stop
 * working when someone's favourite GIF host goes down.
 *
 * `id` travels over the socket (`reaction:send` → `reaction:burst`). Old phones
 * that still send an emoji keep working: the host screen falls back to text.
 */
export const REACTIONS = [
  { id: 'doge', gif: '/gifs/doge.gif', label: 'Doge' },
  { id: 'pop-cat', gif: '/gifs/pop-cat.gif', label: 'Pop Cat' },
  { id: 'keyboard-cat', gif: '/gifs/keyboard-cat.gif', label: 'Keyboard Cat' },
  { id: 'grumpy-cat', gif: '/gifs/grumpy-cat.gif', label: 'Grumpy Cat' },
  { id: 'bongo-cat', gif: '/gifs/bongo-cat.gif', label: 'Bongo Cat' },
  { id: 'cheems', gif: '/gifs/cheems.gif', label: 'Cheems' },
];

export const REACTION_BY_ID = new Map(REACTIONS.map((reaction) => [reaction.id, reaction]));
