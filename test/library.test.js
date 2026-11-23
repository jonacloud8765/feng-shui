'use strict';
const test = require('node:test');
const assert = require('node:assert');
const D = require('../src/main/library-data');
const { profileId, bigGoodreadsImage } = require('../src/main/library');

// Made-up books throughout: these tests are about the shapes of the files.
const CSV = [
  'Book Id,Title,Author,Author l-f,Additional Authors,ISBN,ISBN13,My Rating,Average Rating,Publisher,Binding,Number of Pages,Year Published,Original Publication Year,Date Read,Date Added,Bookshelves,Bookshelves with positions,Exclusive Shelf,My Review,Spoiler,Private Notes,Read Count,Owned Copies',
  '101,"Sample Book: A Subtitle",Ann Author,"Author, Ann",,"=""0306406152""","=""9780306406157""",4,3.91,Pub House,Hardcover,320,2001,1999,2024/05/02,2024/01/10,,,read,"Loved it, truly.",,,1,0',
  '102,Second Sample,Ben Writer,"Writer, Ben","Cat Helper",="",="",0,4.10,Other Press,Paperback,210,2020,2020,,2025/02/01,,,currently-reading,,,,0,0',
  '103,Third Sample,Dee Novelist,"Novelist, Dee",,="",="",0,3.50,,Kindle Edition,,2019,,,2025/03/01,,,to-read,,,,0,0',
].join('\n');

test('ISBN-10s, ISBN-13s and Goodreads-wrapped values all become ISBN-13s', () => {
  assert.strictEqual(D.isbn13('0306406152'), '9780306406157');
  assert.strictEqual(D.isbn13('="9780306406157"'), '9780306406157');
  assert.strictEqual(D.isbn13('978-0-306-40615-7'), '9780306406157');
  assert.strictEqual(D.isbn13('0306406153'), ''); // bad check digit
  assert.strictEqual(D.isbn13('B0ABCDEFGH'), '');  // a Kindle ASIN is not an ISBN
});

test('a Goodreads export gives shelves, ratings, dates and ISBNs', () => {
  const recs = D.parseGoodreadsCsv(CSV);
  assert.strictEqual(recs.length, 3);
  assert.deepStrictEqual(
    { id: recs[0].goodreadsId, title: recs[0].title, isbn: recs[0].isbn, my: recs[0].myRating, shelf: recs[0].shelf, read: recs[0].dateRead, year: recs[0].year, review: recs[0].review, format: recs[0].format },
    { id: '101', title: 'Sample Book: A Subtitle', isbn: '9780306406157', my: 4, shelf: 'read', read: '2024-05-02', year: 1999, review: 'Loved it, truly.', format: 'Hardcover' },
  );
  assert.strictEqual(recs[1].myRating, null); // 0 means not rated
  assert.deepStrictEqual(recs[1].authors, ['Ben Writer', 'Cat Helper']);
  assert.throws(() => D.parseGoodreadsCsv('a,b\n1,2'), /Goodreads/);
});

test('categories: Goodreads gives Reading and Read, the Wish List gives Want to Read, Favorites stand alone', () => {
  const cat = D.emptyCatalogue();
  D.applyGoodreadsCsv(cat, D.parseGoodreadsCsv(CSV));
  const c = D.categories(cat);
  assert.strictEqual(c.read.length, 1);
  assert.strictEqual(c.reading.length, 1);
  assert.strictEqual(c.want.length, 0, 'the Goodreads to-read shelf is not Want to Read');
  const read = c.read[0];
  assert.strictEqual(D.setFavorite(cat, read, true), true);
  assert.deepStrictEqual(D.categories(cat).favorites, [read]);
  assert.deepStrictEqual(D.categories(cat).read, [read], 'a favorite keeps its shelf');
  assert.strictEqual(D.setFavorite(cat, read, false), false);
  assert.deepStrictEqual(D.categories(cat).read, [read]);
});

const WISHLIST = `<span id="profile-list-name">Books</span><a href="/hz/wishlist/ls/ABCDEFGH1234">x</a><ul>
<li data-id="L1" data-itemid="I1" data-price="18.5" data-reposition-action-params="{&quot;itemExternalId&quot;:&quot;ASIN:0306406152|ATVPDKIKX0DER&quot;}">
  <img src="https://m.media-amazon.com/images/I/51abc._SS135_.jpg">
  <a id="itemName_I1" title="Sample Book: A Subtitle" href="/dp/0306406152/?coliid=I1">Sample Book: A Subtitle</a>
  <span id="item-byline-I1">by Ann Author (Hardcover)</span></li>
<li data-id="L1" data-itemid="I2" data-price="-Infinity" data-reposition-action-params="{&quot;itemExternalId&quot;:&quot;ASIN:B0ABCDEFGH|ATVPDKIKX0DER&quot;}">
  <a id="itemName_I2" title="Fourth Sample" href="/dp/B0ABCDEFGH/">Fourth Sample</a>
  <span id="item-byline-I2">by Eve Essayist, Finn Editor (Kindle Edition)</span></li>
<li data-id="L1" data-itemid="I3" data-price="9.99" data-reposition-action-params="{&quot;itemExternalId&quot;:&quot;ASIN:B0TOOTHBRU|ATVPDKIKX0DER&quot;}">
  <a id="itemName_I3" title="Electric Toothbrush" href="/dp/B0TOOTHBRU/">Electric Toothbrush</a>
  <span id="item-byline-I3">by BrushCo</span></li>
</ul>`;

test('a saved Wish List page gives books with ASINs, ISBNs, formats and full-size covers', () => {
  const list = D.parseAmazonWishlist(WISHLIST);
  assert.strictEqual(list.listName, 'Books');
  assert.strictEqual(list.listId, 'ABCDEFGH1234');
  assert.strictEqual(list.items.length, 2);
  assert.strictEqual(list.skipped, 1);
  const [a, b] = list.items;
  assert.deepStrictEqual([a.asin, a.isbn, a.author, a.format, a.price, a.amazonImage, a.amazonUrl],
    ['0306406152', '9780306406157', 'Ann Author', 'Hardcover', 18.5, 'https://m.media-amazon.com/images/I/51abc.jpg', 'https://www.amazon.com/dp/0306406152']);
  assert.deepStrictEqual([b.isbn, b.authors, b.format, b.price], ['', ['Eve Essayist', 'Finn Editor'], 'Kindle Edition', null]);
});

const PRINTVIEW = `11/23/26, 6:57 PM                    books - Amazon.com

   books

             Title                                            Comments    Price    Quantity Has
             Sample Book: A Subtitle
                                                                          $30.56       1     0
             by Ann Author (Paperback) |

             The Long Sample Title That Wraps Onto: A Second Line In The
             Print View                                                   $14.24       1     0
             by Gus Author, Hal Author (Hardcover) |
             Sample Eye: Learning One Thing
                                                                             -         1     0
             by Ivy Lens (Hardcover) |
             Sample Eye: The Other Thing                                  $170.00      1     0
             by Ivy Lens (Hardcover) |

https://www.amazon.com/hz/wishlist/printview/ABCDEFGH1234?paginationToken=x   1/2
                                       See more
`;

test('the Wish List print view (as text) gives titles, authors, formats and prices', () => {
  assert.ok(D.looksLikeWishlistText(PRINTVIEW));
  const list = D.parseWishlistText(PRINTVIEW);
  assert.strictEqual(list.items.length, 4);
  assert.strictEqual(list.truncated, true);
  assert.strictEqual(list.listId, 'ABCDEFGH1234');
  assert.deepStrictEqual(list.items.map((i) => [i.title, i.author, i.format, i.price]), [
    ['Sample Book: A Subtitle', 'Ann Author', 'Paperback', 30.56],
    ['The Long Sample Title That Wraps Onto: A Second Line In The Print View', 'Gus Author', 'Hardcover', 14.24],
    ['Sample Eye: Learning One Thing', 'Ivy Lens', 'Hardcover', null],
    ['Sample Eye: The Other Thing', 'Ivy Lens', 'Hardcover', 170],
  ]);
});

test('books from Goodreads and Amazon are joined by ISBN, then by title and author; distinct books stay apart', () => {
  const cat = D.emptyCatalogue();
  D.applyGoodreadsCsv(cat, D.parseGoodreadsCsv(CSV));
  D.applyAmazonWishlist(cat, D.parseAmazonWishlist(WISHLIST));
  const c = D.categories(cat);
  assert.strictEqual(c.want.length, 2);
  assert.strictEqual(c.want[0], c.read[0], 'the same book by ISBN is one entry, in both categories');
  const b = cat.books[c.want[0]];
  assert.strictEqual(b.myRating, 4, 'personal details survive');
  assert.strictEqual(b.amazonUrl, 'https://www.amazon.com/dp/0306406152');
  // No duplicates inside a category, even if the list repeats.
  D.applyAmazonWishlist(cat, D.parseAmazonWishlist(WISHLIST + WISHLIST));
  assert.strictEqual(D.categories(cat).want.length, 2);
  // Two books that share a main title but not a subtitle stay two books.
  const pv = D.emptyCatalogue();
  D.applyAmazonWishlist(pv, D.parseWishlistText(PRINTVIEW));
  assert.strictEqual(D.categories(pv).want.length, 4);
});

test('the Wish List replaces Want to Read; books that left it go', () => {
  const cat = D.emptyCatalogue();
  D.applyAmazonWishlist(cat, D.parseAmazonWishlist(WISHLIST));
  const one = D.parseAmazonWishlist(WISHLIST);
  one.items = one.items.slice(0, 1);
  D.applyAmazonWishlist(cat, one);
  assert.strictEqual(D.categories(cat).want.length, 1);
  assert.strictEqual(Object.keys(cat.books).length, 1);
});

test('a public profile adds a sample of shelves but never overrides a full export', () => {
  const html = `<title>Ann Reader - City (52 books)</title><a href="/user/show/42-ann">x</a>
  <div id="featured_shelf" class=" clearFloats bigBox"><h2><a href="/review/list/42-ann?shelf=read">Ann’s favorite books</a></h2><div class="imgGrid" style="text-align:center">
    <a href="/book/show/101.Sample_Book"><img alt="x" title="Sample Book by Ann Author" class="inlineblock" src="https://i.gr-assets.com/images/S/compressed.photo.goodreads.com/books/1361355717l/101._SY75_.jpg" /></a>
    <a href="/book/show/555-other"><img alt="x" title="Other Sample by Jo Poet" class="inlineblock" src="https://i.gr-assets.com/x/555._SX50_.jpg" /></a>
  </div></div>
  <a href="/review/list/42?shelf=to-read">to-read</a>&lrm; (13)
  <div class="bigBoxContent containerWithHeaderContent" id="currentlyReadingReviews">
    <div class="Updates no_border"><a class="bookTitle" href="/book/show/777.Now">Reading Now</a><span class="by">by</span> <a class="authorName" href="/author/show/9">Kit Author</a></div>
  </div><div id="yearInBooks"></div>`;
  const p = D.parseGoodreadsProfile(html);
  assert.strictEqual(p.userId, '42');
  assert.strictEqual(p.featuredShelf, 'read');
  assert.deepStrictEqual(p.featured.map((b) => [b.goodreadsId, b.title, b.author]), [['101', 'Sample Book', 'Ann Author'], ['555', 'Other Sample', 'Jo Poet']]);
  assert.deepStrictEqual(p.reading.map((b) => [b.goodreadsId, b.title, b.author]), [['777', 'Reading Now', 'Kit Author']]);
  const cat = D.emptyCatalogue();
  D.applyGoodreadsCsv(cat, D.parseGoodreadsCsv(CSV));
  D.applyGoodreadsProfile(cat, p);
  const c = D.categories(cat);
  assert.strictEqual(c.read.length, 2, 'a new book from the profile is added');
  assert.ok(c.reading.length >= 1);
  const sample = D.findBook(cat, { goodreadsId: '101' });
  assert.strictEqual(cat.shelves[sample.id], 'read');
  assert.strictEqual(sample.myRating, 4);
});

test('a Goodreads book page gives description, genres, rating, cover and edition', () => {
  const state = {
    ROOT_QUERY: { 'getBookByLegacyId({"legacyId":"101"})': { __ref: 'Book:1' } },
    'Book:1': { legacyId: 101, webUrl: 'https://www.goodreads.com/book/show/101.Sample', title: 'Sample Book', 'description({"stripped":true})': 'A made-up description.', imageUrl: 'https://m.media-amazon.com/images/S/compressed.photo.goodreads.com/books/1i/101.jpg',
      primaryContributorEdge: { node: { __ref: 'Contributor:1' } }, bookGenres: [{ genre: { name: 'Philosophy' } }, { genre: { name: 'Classics' } }],
      details: { asin: '0306406152', format: 'Paperback', numPages: 208, publicationTime: 1088492400000, publisher: 'Pub House', isbn: '0306406152', isbn13: '9780306406157' }, work: { __ref: 'Work:1' } },
    'Contributor:1': { name: 'Ann Author' },
    'Work:1': { details: { publicationTime: -74158819622000 }, stats: { averageRating: 3.94, ratingsCount: 15611 } },
  };
  const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { apolloState: state } } })}</script>`;
  const p = D.parseGoodreadsBook(html);
  assert.deepStrictEqual([p.goodreadsId, p.author, p.description, p.genres, p.isbn, p.pages, p.format, p.editionYear, p.avgRating, p.year < 0],
    ['101', 'Ann Author', 'A made-up description.', ['Philosophy', 'Classics'], '9780306406157', 208, 'Paperback', 2004, 3.94, true]);
  // Page details never overwrite personal ones.
  const book = { id: 'x', title: 'Sample Book', myRating: 5, review: 'mine' };
  D.applyBookPage(book, { ...p, myRating: 1, review: 'theirs' });
  assert.deepStrictEqual([book.myRating, book.review, book.avgRating], [5, 'mine', 3.94]);
});

test('profile links and cover sizes', () => {
  assert.strictEqual(profileId('https://www.goodreads.com/user/show/12345678-someone'), '12345678');
  assert.strictEqual(profileId('12345678'), '12345678');
  assert.strictEqual(profileId('https://example.com/user/show/1'), '');
  assert.strictEqual(bigGoodreadsImage('https://i.gr-assets.com/images/S/compressed.photo.goodreads.com/books/1361355717l/1354._SX98_.jpg'),
    'https://i.gr-assets.com/images/S/compressed.photo.goodreads.com/books/1361355717i/1354.jpg');
  assert.strictEqual(bigGoodreadsImage('https://s.gr-assets.com/assets/nophoto/book/111x148.png'), '');
});

test('Goodreads search results are read from the new streamed page and the old one', () => {
  const book = (id, slug, title, author) =>
    `{\\"__typename\\":\\"Book\\",\\"details\\":{\\"__typename\\":\\"BookDetails\\",\\"publicationTime\\":1}},\\"id\\":\\"kca://book/x\\",\\"legacyId\\":${id},\\"title\\":\\"${title}\\",\\"imageUrl\\":\\"https://example.com/${id}.jpg\\",\\"webUrl\\":\\"https://www.goodreads.com/book/show/${id}-${slug}\\",\\"description\\":\\"$56\\",\\"bookSeries\\":[],\\"primaryContributorEdge\\":{\\"__typename\\":\\"BookContributorEdge\\",\\"node\\":{\\"__typename\\":\\"Contributor\\",\\"legacyId\\":9,\\"id\\":\\"kca://author/x\\",\\"name\\":\\"${author}\\"}}`;
  const html = `<script>self.__next_f.push([1,"${book(1, 'summary', 'Summary of Breath by James Nestor', 'Genius Reads')}${book(2, 'breath', 'Breath: The New Science of a Lost Art', 'James Nestor')}"])</script>`;
  const rows = D.parseGoodreadsSearch(html);
  assert.deepStrictEqual(rows.map((r) => r.path), ['/book/show/1-summary', '/book/show/2-breath']);
  const want = D.workKey({ title: 'Breath: The New Science of a Lost Art', author: 'James Nestor' });
  assert.strictEqual(rows.find((r) => D.workKey(r) === want).path, '/book/show/2-breath');
  const old = '<a class="bookTitle" href="/book/show/7-gorgias?from_search=true"><span itemprop="name">Gorgias</span></a> by <a class="authorName" href="/a"><span itemprop="name">Plato</span></a>';
  assert.deepStrictEqual(D.parseGoodreadsSearch(old), [{ path: '/book/show/7-gorgias', title: 'Gorgias', author: 'Plato' }]);
});
