'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { parseTitle, normalize, parseWatchlistPage, posterUrl } = require('../src/main/movies');

test('titles and years come out of release-style file names', () => {
  assert.deepStrictEqual(parseTitle('The.Tree.of.Life.2011.720p.BrRip.x264.YIFY'), { title: 'The Tree of Life', year: 2011 });
  assert.deepStrictEqual(parseTitle('The Perfect Storm (2000) (1080p BluRay x265 10bit)'), { title: 'The Perfect Storm', year: 2000 });
  assert.deepStrictEqual(parseTitle('Blade Runner 2049 (2017)'), { title: 'Blade Runner 2049', year: 2017 });
  assert.deepStrictEqual(parseTitle('Heat 1080p WEBRip'), { title: 'Heat', year: null });
});

test('episodes are recognised as shows', () => {
  assert.deepStrictEqual(parseTitle('Show.Name.S03E04.720p.WEBRip'), { title: 'Show Name', year: null, season: 3, episode: 4 });
  assert.deepStrictEqual(parseTitle('Show Name - 2x05 - Episode Title'), { title: 'Show Name', year: null, season: 2, episode: 5 });
});

test('normalize ignores case, accents, punctuation and leading articles', () => {
  assert.strictEqual(normalize('The Lord of the Rings: The Return of the King'), normalize('lord of the rings the return of the king'));
  assert.strictEqual(normalize('Amélie'), 'amelie');
  assert.strictEqual(normalize('Fast & Furious'), 'fast and furious');
});

test('watchlist pages yield titles, years and poster URLs', () => {
  const html = `<a href="/someone/watchlist/page/2/">2</a><a href="/someone/watchlist/page/7/">7</a>
  <div class="react-component" data-component-class="LazyPoster" data-item-slug="the-color-of-money" data-item-full-display-name="The Color of Money (1986)" data-postered-identifier='{&quot;uid&quot;:&quot;film:44930&quot;}' data-resolvable-poster-path='{&quot;cacheBustingKey&quot;:&quot;8861899e&quot;}' >`;
  const r = parseWatchlistPage(html);
  assert.strictEqual(r.lastPage, 7);
  assert.deepStrictEqual(r.films[0], {
    slug: 'the-color-of-money',
    title: 'The Color of Money',
    year: 1986,
    link: 'https://letterboxd.com/film/the-color-of-money/',
    poster: 'https://a.ltrbxd.com/resized/film-poster/4/4/9/3/0/44930-the-color-of-money-0-230-0-345-crop.jpg?v=8861899e',
  });
  assert.strictEqual(posterUrl('12a', 'x', null), null);
});

test('film pages yield genres, rating, popularity and length', () => {
  const { parseFilmPage, parseWatchedCount } = require('../src/main/movies');
  const html = '<script type="application/ld+json">/* <![CDATA[ */ {"director":[{"@type":"Person","name":"Richard Attenborough"}],"actor":[{"name":"Ben Kingsley"},{"name":"Candice Bergen"}]} /* ]]> */</script><meta property="og:title" content="Gandhi (1982)" /> {"genre":["Drama","History"],"image":"https://a.ltrbxd.com/resized/sm/upload/x-0-600-0-900-crop.jpg?v=1","aggregateRating":{"ratingValue":3.75,"ratingCount":87695}} <p>192&nbsp;mins</p>';
  assert.deepStrictEqual(parseFilmPage(html), {
    poster: 'https://a.ltrbxd.com/resized/sm/upload/x-0-230-0-345-crop.jpg?v=1',
    year: 1982, genres: ['Drama', 'History'], rating: 3.75, ratingCount: 87695, runtime: 192,
    directors: ['Richard Attenborough'], cast: ['Ben Kingsley', 'Candice Bergen'],
  });
  assert.strictEqual(parseWatchedCount('<h1 class="section-heading"><span class="tooltip" title="1,040&nbsp;films">Watched</span></h1>'), 1040);
  assert.strictEqual(parseWatchedCount('<p>nothing</p>'), null);
});
