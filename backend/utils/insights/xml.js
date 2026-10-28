// Just enough XML reading for RSS feeds and CAP alert files. Both are simple and regular, so a few
// careful helpers are enough and no extra package is needed.
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

const decode = (s = '') =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);

const stripTags = (s = '') => decode(s).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

const escapeName = (name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// All blocks like <tag ...>inner</tag>. Returns [{ attrs, inner }].
const blocks = (xml, tag) => {
  const re = new RegExp(`<(?:[\\w-]+:)?${escapeName(tag)}(\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?${escapeName(tag)}>`, 'gi');
  const out = [];
  let m;
  while ((m = re.exec(xml || ''))) out.push({ attrs: m[1] || '', inner: m[2] });
  return out;
};

// Text of the first <tag>, tags removed and entities decoded. '' when absent.
const text = (xml, tag) => {
  const b = blocks(xml, tag)[0];
  return b ? stripTags(b.inner) : '';
};

// Value of an attribute inside the opening tag text returned by blocks().
const attr = (attrs, name) => {
  const m = new RegExp(`${escapeName(name)}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(attrs || '');
  return m ? decode(m[2] ?? m[3]) : '';
};

module.exports = { blocks, text, attr, stripTags, decode };
