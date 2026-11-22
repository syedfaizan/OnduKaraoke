/**
 * Pure checks for the GIPHY meme source — no network, no server needed.
 *
 *   npm run smoke:memes
 */

import { MEME_REACTIONS, isGiphyMediaUrl } from '../../shared/memes.js';
import { giphySearchUrl, pickGiphyUrl } from '../../shared/giphy.js';
import { fetchGiphyMemes } from '../../client/src/lib/giphy.js';

let failures = 0;

function check(label, condition, extra = '') {
  if (condition) {
    console.log(`  ✓ ${label}`);
  } else {
    failures += 1;
    console.log(`  ✗ ${label}${extra ? ` → ${extra}` : ''}`);
  }
}

console.log('\n· meme ids');
check('six stable meme ids', MEME_REACTIONS.length === 6);
check(
  'every meme has a label and a search query',
  MEME_REACTIONS.every((meme) => meme.id && meme.label && meme.query),
);

console.log('\n· GIPHY url validation');
const good = [
  'https://media.giphy.com/media/abc123/giphy.gif',
  'https://media2.giphy.com/media/abc123/giphy.gif?cid=party',
];
const bad = [
  'https://evil.example/media/abc.gif',
  'http://media.giphy.com/media/abc.gif',
  'https://media.giphy.com.evil.example/media/abc.gif',
  'https://media.giphy.com/other/abc.gif',
  'x'.repeat(301),
];
check('GIPHY CDN urls are accepted', good.every(isGiphyMediaUrl));
check('other hosts, http and odd paths are rejected', bad.every((url) => !isGiphyMediaUrl(url)));

console.log('\n· GIPHY request + response helpers');
const search = new URL(giphySearchUrl('test-key', 'dancing cat'));
check('search targets GIPHY', search.origin + search.pathname === 'https://api.giphy.com/v1/gifs/search');
check(
  'search is small and party-friendly',
  search.searchParams.get('api_key') === 'test-key' &&
    search.searchParams.get('q') === 'dancing cat' &&
    search.searchParams.get('limit') === '1' &&
    search.searchParams.get('rating') === 'g',
);
check('no rendition bundle is requested', !search.searchParams.has('bundle'));
check(
  'the 200px rendition is preferred',
  pickGiphyUrl({
    images: {
      fixed_height: { url: 'https://media.giphy.com/media/abc/giphy.gif' },
      original: { url: 'https://media.giphy.com/media/abc/original.gif' },
    },
  }) === 'https://media.giphy.com/media/abc/giphy.gif',
);
check(
  'a non-GIPHY url is never picked',
  pickGiphyUrl({ images: { fixed_height: { url: 'https://evil.example/x.gif' } } }) === '',
);

console.log('\n· phone-side fetch');
const noKey = await fetchGiphyMemes({ apiKey: '' });
check('no key means no remote memes', noKey.length === 0);

let calls = 0;
const fakeFetch = async (url) => {
  calls += 1;
  const term = new URL(url).searchParams.get('q').replace(/\W/g, '') || calls;
  return {
    ok: true,
    json: async () => ({
      data: [{ images: { fixed_height: { url: `https://media.giphy.com/media/${term}/giphy.gif` } } }],
    }),
  };
};

const found = await fetchGiphyMemes({ apiKey: 'test-key', doFetch: fakeFetch });
check('one search per meme', calls === 6, String(calls));
check('six memes come back', found.length === 6);
check(
  'each query is mapped to its own id and url',
  found.every(
    (meme, index) =>
      meme.id === MEME_REACTIONS[index].id &&
      meme.url.startsWith('https://media.giphy.com/media/'),
  ),
);
check('results are fetched afresh, not cached', (await fetchGiphyMemes({ apiKey: 'test-key', doFetch: fakeFetch })).length === 6 && calls === 12, String(calls));

const partial = await fetchGiphyMemes({
  apiKey: 'test-key',
  doFetch: async () => ({ ok: false, json: async () => ({}) }),
});
check('a failed search falls back to the local GIF', partial.every((meme) => meme.url === ''));

console.log(`\n${failures ? `✗ ${failures} check(s) failed` : '✓ all meme checks passed'}\n`);
process.exit(failures ? 1 : 0);
