// Local news headlines from free, keyless sources. Only the headline, the publisher's name, the time and a
// link back to the publisher are kept: the article itself is never copied, so readers go to the publisher.
//   1. Google News RSS search for the city (public RSS, any language we support).
//   2. GDELT DOC API as a back-up when the RSS feed is unavailable.
const { getJson, getText } = require('./http');
const { cached } = require('./cache');
const { blocks, text, stripTags } = require('./xml');

const TTL_MS = 15 * 60 * 1000;
const BREAKING_MS = 3 * 60 * 60 * 1000;
const MAX_ITEMS = 25;
const LANGS = { en: { hl: 'en-IN', ceid: 'IN:en' }, hi: { hl: 'hi', ceid: 'IN:hi' }, te: { hl: 'te', ceid: 'IN:te' } };

const normTitle = (t) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

// Google News puts "Headline - Publisher" in the title; the publisher is also in <source>.
const cleanTitle = (title, source) => {
  const t = stripTags(title);
  if (source && t.endsWith(` - ${source}`)) return t.slice(0, -(source.length + 3)).trim();
  return t;
};

const fromGoogleRss = (xml) =>
  blocks(xml, 'item')
    .map((i) => {
      const src = blocks(i.inner, 'source')[0];
      const source = src ? stripTags(src.inner) : '';
      const publishedAt = Date.parse(text(i.inner, 'pubDate'));
      const title = cleanTitle(text(i.inner, 'title'), source);
      const url = text(i.inner, 'link');
      if (!title || !/^https?:\/\//.test(url) || !Number.isFinite(publishedAt)) return null;
      return { id: url, title, url, source: source || 'News', publishedAt: new Date(publishedAt).toISOString() };
    })
    .filter(Boolean);

// GDELT dates look like 20261028T093000Z.
const gdeltDate = (s) => {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(String(s || ''));
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])).toISOString() : null;
};

const fromGdelt = (json) =>
  (json.articles || [])
    .map((a) => {
      const publishedAt = gdeltDate(a.seendate);
      if (!a.title || !/^https?:\/\//.test(a.url || '') || !publishedAt) return null;
      return { id: a.url, title: stripTags(a.title), url: a.url, source: a.domain || 'News', publishedAt };
    })
    .filter(Boolean);

const tidy = (items, now = Date.now()) => {
  const seen = new Set();
  return items
    .filter((n) => {
      const k = normTitle(n.title);
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    .slice(0, MAX_ITEMS)
    .map((n) => ({ ...n, breaking: now - Date.parse(n.publishedAt) <= BREAKING_MS && now >= Date.parse(n.publishedAt) }));
};

const fetchNews = async ({ city, lang }) => {
  const l = LANGS[lang] || LANGS.en;
  const query = `${city} when:2d`;
  try {
    const xml = await getText(`https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=${l.hl}&gl=IN&ceid=${encodeURIComponent(l.ceid)}`, { headers: { Accept: 'application/rss+xml, application/xml' } });
    const items = tidy(fromGoogleRss(xml));
    if (items.length) return items;
  } catch (e) {
    // fall through to the back-up source
  }
  const q = new URLSearchParams({ query: `"${city}" sourcecountry:IN`, mode: 'artlist', format: 'json', maxrecords: '40', sort: 'datedesc', timespan: '2d' });
  return tidy(fromGdelt(await getJson(`https://api.gdeltproject.org/api/v2/doc/doc?${q}`)));
};

// Cached per city and language: one fetch serves every resident of that city.
const getNews = ({ city, lang = 'en' }) => {
  const key = `${String(city).toLowerCase()}|${LANGS[lang] ? lang : 'en'}`;
  return cached(`news|${key}`, TTL_MS, () => fetchNews({ city, lang: LANGS[lang] ? lang : 'en' }));
};

module.exports = { getNews, fromGoogleRss, fromGdelt, tidy, cleanTitle, LANGS };
