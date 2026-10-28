const h = require('./helpers/harness');
const { clearCache } = require('../utils/insights/cache');
const { resetTracker } = require('../utils/insights/gold');
const { clearCache: clearNearby } = require('../utils/nearbyPlaces');
const { parseCap, deriveFromForecast, impactNote } = require('../utils/insights/alerts');
const { fromGoogleRss, fromGdelt, tidy, cleanTitle } = require('../utils/insights/news');
const { shape } = require('../utils/insights/weather');
const { blocks, text } = require('../utils/insights/xml');

const real = global.fetch;
const json = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
const xml = (body) => ({ ok: true, status: 200, text: async () => body, json: async () => ({}) });
const down = { ok: false, status: 503, json: async () => ({}), text: async () => '' };

const as = (role = 'resident') => {
  const u = h.makeUser({ role, googleId: 'g', ...(role === 'resident' ? {} : { flatNo: undefined, block: undefined }) });
  h.knowUsers(u);
  return u;
};
const get = (path, role) => h.api().get(`/api/insights${path}`).set(h.auth(as(role)));

const society = { name: 'Serene Residency', address: { street: '1 Lake Rd', city: 'Hyderabad', state: 'Telangana', pincode: '500081' }, location: { lat: 17.385, lng: 78.4867, radiusMeters: 300 } };

// A trimmed Open-Meteo answer: three hours and three days.
const forecast = (over = {}) => ({
  timezone: 'Asia/Kolkata',
  current: { time: '2026-10-28T15:30', temperature_2m: 29.2, relative_humidity_2m: 68, apparent_temperature: 32.4, is_day: 1, weather_code: 2, surface_pressure: 1012.3, wind_speed_10m: 12.1, wind_direction_10m: 225, wind_gusts_10m: 25 },
  hourly: {
    time: ['2026-10-28T14:00', '2026-10-28T15:00', '2026-10-28T16:00', '2026-10-28T17:00'],
    temperature_2m: [30, 29.4, 28.8, 27.9],
    precipitation_probability: [10, 28, 45, 60],
    weather_code: [2, 2, 61, 63],
    is_day: [1, 1, 1, 1],
    uv_index: [6.1, 5.2, 3.4, 1.2],
    visibility: [24000, 10000, 9000, 8000]
  },
  daily: {
    time: ['2026-10-28', '2026-10-29', '2026-10-30'],
    weather_code: [2, 65, 95],
    temperature_2m_max: [33, 30, 29],
    temperature_2m_min: [27, 26, 25],
    precipitation_probability_max: [10, 80, 70],
    precipitation_sum: [0.2, 72.4, 20],
    wind_speed_10m_max: [14, 30, 32],
    wind_gusts_10m_max: [25, 52, 48],
    uv_index_max: [7, 3, 5],
    sunrise: ['2026-10-28T06:05', '2026-10-29T06:05', '2026-10-30T06:06'],
    sunset: ['2026-10-28T17:48', '2026-10-29T17:47', '2026-10-30T17:47']
  },
  ...over
});

const capXml = (over = {}) => `<?xml version="1.0"?><alert xmlns="urn:oasis:names:tc:emergency:cap:1.2"><identifier>SACHET-1</identifier><sender>imd@gov.in</sender><sent>2026-10-28T08:00:00+05:30</sent>
<info><language>en-IN</language><category>Met</category><event>Heavy Rain</event><urgency>Expected</urgency><severity>Severe</severity><certainty>Likely</certainty>
<effective>2026-10-28T08:00:00+05:30</effective><expires>${over.expires || '2099-01-01T00:00:00+05:30'}</expires><senderName>India Meteorological Department</senderName>
<headline>Heavy rain over Hyderabad</headline><description>Heavy to very heavy rainfall is likely at isolated places &amp; thunderstorms.</description>
<area><areaDesc>${over.area || 'Hyderabad, Rangareddy'}</areaDesc></area></info></alert>`;

const rss = (items) => `<?xml version="1.0"?><rss><channel>${items.map((i) => `<item><title>${i.title}</title><link>${i.link}</link><description>${i.description || ''}</description><pubDate>${i.pubDate || 'Wed, 28 Oct 2026 09:00:00 GMT'}</pubDate>${i.source ? `<source url="https://example.com">${i.source}</source>` : ''}</item>`).join('')}</channel></rss>`;

beforeEach(() => {
  h.reset();
  clearCache();
  clearNearby();
  resetTracker();
  h.knowSociety(society);
});
afterEach(() => {
  global.fetch = real;
});

describe('xml helpers', () => {
  test('read tags, CDATA and entities', () => {
    const x = '<a><b x="1"><![CDATA[Tom & <i>Jerry</i>]]></b><b>Fish &amp; Chips</b></a>';
    expect(blocks(x, 'b')).toHaveLength(2);
    expect(text(x, 'b')).toBe('Tom & Jerry');
    expect(text('<cap:note>hi</cap:note>', 'note')).toBe('hi');
  });
});

describe('weather', () => {
  test('shapes the forecast into the numbers the app shows', () => {
    const w = shape(forecast());
    expect(w.current).toMatchObject({ temp: 29, feelsLike: 32, humidity: 68, windKmh: 12, windDir: 'SW', pressure: 1012, rainChance: 28, uv: 5, uvLabel: 'Moderate', visibilityKm: 10, condition: 'Partly cloudy', icon: 'partly' });
    expect(w.today).toBe('2026-10-28');
    // the list starts at the current hour
    expect(w.hourly.map((x) => x.time)).toEqual(['2026-10-28T15:00', '2026-10-28T16:00', '2026-10-28T17:00']);
    expect(w.hourly[1]).toMatchObject({ condition: 'Light rain', icon: 'rain', rainChance: 45 });
    expect(w.daily[1]).toMatchObject({ condition: 'Heavy rain', icon: 'heavy-rain', max: 30, min: 26, rainChance: 80, gustMax: 52 });
  });

  test('a resident gets weather for the society pin and it is cached for everyone', async () => {
    global.fetch = jest.fn().mockResolvedValue(json(forecast()));
    const first = await get('/weather');
    expect(first.status).toBe(200);
    expect(first.body.place).toMatchObject({ city: 'Hyderabad', pinned: true });
    expect(first.body.weather.current.temp).toBe(29);
    const url = String(global.fetch.mock.calls[0][0]);
    expect(url).toContain('api.open-meteo.com');
    expect(url).toContain('latitude=17.385');
    const second = await get('/weather', 'security');
    expect(second.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('keeps showing the last answer, marked stale, when the service is down', async () => {
    global.fetch = jest.fn().mockResolvedValue(json(forecast()));
    await get('/weather');
    const { cached } = require('../utils/insights/cache');
    // expire the entry, then fail the next call
    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 60 * 60 * 1000);
    global.fetch = jest.fn().mockResolvedValue(down);
    const res = await get('/weather');
    Date.now.mockRestore();
    expect(cached).toBeDefined();
    expect(res.status).toBe(200);
    expect(res.body.stale).toBe(true);
    expect(res.body.weather.current.temp).toBe(29);
  });

  test('says so with a 502 when the service is down and nothing was saved', async () => {
    global.fetch = jest.fn().mockResolvedValue(down);
    const res = await get('/weather');
    expect(res.status).toBe(502);
    expect(res.body.message).toMatch(/not available/i);
  });

  test('finds the city when the admin has not pinned the society', async () => {
    h.knowSociety({ ...society, location: undefined });
    global.fetch = jest.fn().mockImplementation(async (url) =>
      String(url).includes('geocoding-api') ? json({ results: [{ latitude: 17.38, longitude: 78.48, admin1: 'Telangana' }] }) : json(forecast())
    );
    const res = await get('/weather');
    expect(res.status).toBe(200);
    expect(res.body.place.pinned).toBe(false);
    expect(String(global.fetch.mock.calls[1][0])).toContain('latitude=17.38');
  });

  test('asks the office to add an address when the place cannot be found', async () => {
    h.knowSociety({ ...society, location: undefined });
    global.fetch = jest.fn().mockResolvedValue(json({ results: [] }));
    const res = await get('/weather');
    expect(res.status).toBe(409);
  });

  test('needs a signed-in user', async () => {
    expect((await h.api().get('/api/insights/weather')).status).toBe(401);
  });

  test('uses the phone’s live position when lat and lng are sent', async () => {
    global.fetch = jest.fn().mockImplementation(async (url) =>
      String(url).includes('nominatim') ? json({ address: { city: 'Pune', state: 'Maharashtra' } }) : json(forecast())
    );
    const res = await get('/weather?lat=18.5204&lng=73.8567');
    expect(res.status).toBe(200);
    expect(res.body.place).toMatchObject({ city: 'Pune', state: 'Maharashtra', live: true, pinned: false });
    const weatherUrl = String(global.fetch.mock.calls.find((c) => String(c[0]).includes('open-meteo'))[0]);
    expect(weatherUrl).toContain('latitude=18.5204');
  });

  test('names the town once per area and still answers if the name lookup fails', async () => {
    global.fetch = jest.fn().mockImplementation(async (url) => (String(url).includes('nominatim') ? down : json(forecast())));
    const res = await get('/weather?lat=18.5204&lng=73.8567');
    expect(res.status).toBe(200);
    // falls back to the society's town so news and warnings still have a place name
    expect(res.body.place).toMatchObject({ city: 'Hyderabad', live: true });
  });

  test('falls back to the society when the position is missing, and rejects nonsense', async () => {
    global.fetch = jest.fn().mockResolvedValue(json(forecast()));
    const none = await get('/weather');
    expect(none.body.place.live).toBe(false);
    expect((await get('/weather?lat=999&lng=10')).status).toBe(400);
  });
});

describe('alerts', () => {
  test('forecast advisories follow the rain, wind and storm numbers', () => {
    const list = deriveFromForecast(shape(forecast()));
    const titles = list.map((a) => `${a.date}:${a.title}`);
    expect(titles).toContain('2026-10-29:Heavy Rain Alert');
    expect(titles).toContain('2026-10-29:Strong Winds Advisory');
    expect(titles).toContain('2026-10-30:Thunderstorm Advisory');
    expect(list.some((a) => a.date === '2026-10-28')).toBe(false); // a dry day raises nothing
  });

  test('a very hot day raises a heat advisory', () => {
    const w = shape(forecast());
    w.daily[0].max = 44;
    expect(deriveFromForecast(w).find((a) => a.subtype === 'heat')).toMatchObject({ severity: 'warning' });
  });

  test('reads an official CAP warning', () => {
    const a = parseCap(capXml(), 'https://x/1.xml');
    expect(a).toMatchObject({ kind: 'official', severity: 'warning', title: 'Heavy rain over Hyderabad', area: 'Hyderabad, Rangareddy', source: 'India Meteorological Department' });
    expect(a.message).toContain('thunderstorms');
  });

  test('earthquake notes get stronger with the magnitude', () => {
    expect(impactNote(4.2)).toBe('No major impact expected');
    expect(impactNote(5.3)).toMatch(/felt strongly/);
    expect(impactNote(6.4)).toMatch(/official guidance/);
  });

  const quakeBody = { features: [{ id: 'us1', properties: { mag: 4.2, place: '120 km SE of Nizamabad', time: Date.parse('2026-10-28T05:12:00+05:30'), url: 'https://earthquake.usgs.gov/e/us1' }, geometry: { coordinates: [79.5, 16.5, 10] } }] };

  test('combines official, forecast and earthquake alerts, worst first', async () => {
    global.fetch = jest.fn().mockImplementation(async (url) => {
      const u = String(url);
      if (u.includes('open-meteo')) return json(forecast());
      if (u.includes('rss_telangana.xml')) return xml(rss([{ title: 'Heavy rain', link: 'https://sachet.ndma.gov.in/cap/1.xml' }]));
      if (u.endsWith('/cap/1.xml')) return xml(capXml());
      if (u.includes('usgs.gov')) return json(quakeBody);
      return down;
    });
    const res = await get('/alerts');
    expect(res.status).toBe(200);
    expect(res.body.sources).toEqual({ official: true, forecast: true, earthquakes: true });
    const kinds = res.body.alerts.map((a) => a.kind);
    expect(kinds).toEqual(expect.arrayContaining(['official', 'forecast', 'quake']));
    expect(res.body.alerts[0].severity).not.toBe('info');
    const quake = res.body.alerts.find((a) => a.kind === 'quake');
    expect(quake).toMatchObject({ magnitude: 4.2, note: 'No major impact expected', source: 'USGS' });
    expect(quake.message).toMatch(/^M 4\.2 · \d+ km from Hyderabad$/);
    expect(res.body.alerts.find((a) => a.kind === 'official').local).toBe(true);
    expect(String(global.fetch.mock.calls.find((c) => String(c[0]).includes('usgs'))[0])).toContain('latitude=17.385');
  });

  test('ignores warnings that have already ended', async () => {
    global.fetch = jest.fn().mockImplementation(async (url) => {
      const u = String(url);
      if (u.includes('open-meteo')) return json(forecast({ daily: { ...forecast().daily, precipitation_sum: [0, 0, 0], weather_code: [1, 1, 1], wind_gusts_10m_max: [10, 10, 10] } }));
      if (u.includes('rss_telangana.xml')) return xml(rss([{ title: 'Old', link: 'https://sachet.ndma.gov.in/cap/2.xml' }]));
      if (u.endsWith('/cap/2.xml')) return xml(capXml({ expires: '2020-01-01T00:00:00+05:30' }));
      if (u.includes('usgs.gov')) return json({ features: [] });
      return down;
    });
    const res = await get('/alerts');
    expect(res.body.alerts).toEqual([]);
  });

  test('falls back to the national feed and keeps only warnings for this city or state', async () => {
    global.fetch = jest.fn().mockImplementation(async (url) => {
      const u = String(url);
      if (u.includes('open-meteo')) return json(forecast({ daily: { ...forecast().daily, precipitation_sum: [0, 0, 0], weather_code: [1, 1, 1], wind_gusts_10m_max: [10, 10, 10] } }));
      if (u.includes('rss_telangana.xml')) return down;
      if (u.includes('rss_india.xml')) return xml(rss([{ title: 'Cyclone watch Odisha coast', link: 'https://sachet.ndma.gov.in/cap/3.xml' }, { title: 'Heavy rain Hyderabad', link: 'https://sachet.ndma.gov.in/cap/4.xml' }]));
      if (u.endsWith('/cap/4.xml')) return xml(capXml());
      if (u.includes('usgs.gov')) return json({ features: [] });
      return down;
    });
    const res = await get('/alerts');
    expect(res.body.alerts.map((a) => a.title)).toEqual(['Heavy rain over Hyderabad']);
    expect(global.fetch.mock.calls.some((c) => String(c[0]).endsWith('/cap/3.xml'))).toBe(false);
  });

  test('one source being down does not hide the others', async () => {
    global.fetch = jest.fn().mockImplementation(async (url) => (String(url).includes('open-meteo') ? json(forecast()) : down));
    const res = await get('/alerts');
    expect(res.status).toBe(200);
    expect(res.body.sources).toEqual({ official: false, forecast: true, earthquakes: false });
    expect(res.body.alerts.some((a) => a.kind === 'forecast')).toBe(true);
  });
});

describe('gold rates', () => {
  const answer = (usd, inr = 84) => async (url) => {
    const u = String(url);
    if (u.includes('gold-api')) return json({ name: 'Gold', price: usd, symbol: 'XAU', updatedAt: '2026-10-28T09:40:00Z' });
    if (u.includes('er-api')) return json({ result: 'success', rates: { INR: inr } });
    return down;
  };

  test('converts the ounce price in dollars to rupees per gram, 24K and 22K', async () => {
    global.fetch = jest.fn().mockImplementation(answer(3110.34768, 100));
    const res = await get('/gold');
    expect(res.status).toBe(200);
    // 3110.34768 USD/oz / 31.1034768 g * 100 INR = 10,000 per gram
    expect(res.body.gold.k24.perGram).toBe(10000);
    expect(res.body.gold.k22.perGram).toBe(9167);
    expect(res.body.gold.note).toMatch(/indicative/i);
    expect(res.body.gold.k24.change).toBeNull(); // first reading of the day
  });

  test('shows the change since the previous day', async () => {
    const gold = require('../utils/insights/gold');
    const day = 24 * 60 * 60 * 1000;
    const now = Date.now();
    global.fetch = jest.fn().mockImplementation(answer(3110.34768, 100));
    jest.spyOn(Date, 'now').mockReturnValue(now);
    await gold.fetchGold();
    global.fetch = jest.fn().mockImplementation(answer(3141.45116, 100)); // +1%
    Date.now.mockReturnValue(now + day);
    const next = await gold.fetchGold();
    Date.now.mockRestore();
    expect(next.k24.perGram).toBe(10100);
    expect(next.k24.change).toEqual({ amount: 100, percent: 1 });
  });

  test('uses the back-up exchange rate when the first is down', async () => {
    global.fetch = jest.fn().mockImplementation(async (url) => {
      const u = String(url);
      if (u.includes('gold-api')) return json({ price: 3110.34768 });
      if (u.includes('frankfurter')) return json({ rates: { INR: 90 } });
      return down;
    });
    expect((await get('/gold')).body.gold.k24.perGram).toBe(9000);
  });

  test('says so when the price is missing', async () => {
    global.fetch = jest.fn().mockImplementation(async (url) => (String(url).includes('gold-api') ? json({}) : json({ rates: { INR: 84 } })));
    expect((await get('/gold')).status).toBe(502);
  });
});

describe('news', () => {
  const google = rss([
    { title: 'HMDA announces new rules for apartments - The Hindu', link: 'https://news.google.com/rss/articles/a1', source: 'The Hindu', pubDate: new Date(Date.now() - 2 * 3600 * 1000).toUTCString() },
    { title: 'Telangana to get heavy rains - Deccan Chronicle', link: 'https://news.google.com/rss/articles/a2', source: 'Deccan Chronicle', pubDate: new Date(Date.now() - 20 * 3600 * 1000).toUTCString() },
    { title: 'HMDA announces new rules for apartments - Deccan Chronicle', link: 'https://news.google.com/rss/articles/a3', source: 'Deccan Chronicle', pubDate: new Date(Date.now() - 3 * 3600 * 1000).toUTCString() }
  ]);

  test('strips the publisher from the headline', () => {
    expect(cleanTitle('Big news - The Hindu', 'The Hindu')).toBe('Big news');
    expect(cleanTitle('A - B headline', 'The Hindu')).toBe('A - B headline');
  });

  test('lists the newest headlines, drops repeats and marks fresh ones as breaking', async () => {
    global.fetch = jest.fn().mockResolvedValue(xml(google));
    const res = await get('/news');
    expect(res.status).toBe(200);
    // the publisher is cut from the headline when Google names it; the repeat from another publisher is dropped
    expect(res.body.news.map((n) => n.title)).toEqual(['HMDA announces new rules for apartments', 'Telangana to get heavy rains']);
    expect(res.body.news[0].breaking).toBe(true);
    expect(res.body.news[1].breaking).toBe(false);
    expect(res.body.news[0]).toMatchObject({ source: 'The Hindu', url: 'https://news.google.com/rss/articles/a1' });
    const url = decodeURIComponent(String(global.fetch.mock.calls[0][0]));
    expect(url).toContain('q=Hyderabad when:2d');
    expect(url).toContain('hl=en-IN');
  });

  test('asks for Telugu headlines when the app is in Telugu', async () => {
    global.fetch = jest.fn().mockResolvedValue(xml(google));
    await get('/news?lang=te');
    expect(decodeURIComponent(String(global.fetch.mock.calls[0][0]))).toContain('hl=te');
  });

  test('refuses an unknown language', async () => {
    expect((await get('/news?lang=xx')).status).toBe(400);
  });

  test('uses GDELT when the news feed is down', async () => {
    global.fetch = jest.fn().mockImplementation(async (url) =>
      String(url).includes('gdeltproject') ? json({ articles: [{ url: 'https://example.com/a', title: 'Metro services extended', seendate: '20261028T093000Z', domain: 'example.com' }] }) : down
    );
    const res = await get('/news');
    expect(res.status).toBe(200);
    expect(res.body.news[0]).toMatchObject({ title: 'Metro services extended', source: 'example.com', publishedAt: '2026-10-28T09:30:00.000Z' });
  });

  test('reads GDELT dates and ignores items with no usable link', () => {
    expect(fromGdelt({ articles: [{ url: 'javascript:1', title: 'x', seendate: '20261028T093000Z' }] })).toEqual([]);
    expect(fromGoogleRss(rss([{ title: 'No link', link: 'ftp://x' }]))).toEqual([]);
    expect(tidy([])).toEqual([]);
  });
});

describe('nearby emergency help', () => {
  test('lists the nearest police and hospital with distances and the national numbers', async () => {
    global.fetch = jest.fn().mockImplementation(async (url, opts) => {
      const body = decodeURIComponent(String((opts && opts.body) || ''));
      const els = body.includes('police')
        ? [{ type: 'node', id: 1, lat: 17.3875, lon: 78.4867, tags: { name: 'Madhapur Police Station', amenity: 'police', opening_hours: '24/7', phone: '+91 40 1234 5678; +91 40 8888' } }]
        : [{ type: 'node', id: 2, lat: 17.39, lon: 78.4867, tags: { name: 'KPHB Government Hospital', amenity: 'hospital' } }];
      return json({ elements: els });
    });
    const res = await get('/emergency');
    expect(res.status).toBe(200);
    expect(res.body.police[0]).toMatchObject({ name: 'Madhapur Police Station', open24: true, phone: '+91 40 1234 5678', kind: 'police' });
    expect(res.body.hospitals[0]).toMatchObject({ name: 'KPHB Government Hospital', open24: false, kind: 'hospital' });
    expect(res.body.police[0].distanceM).toBeGreaterThan(0);
    expect(res.body.helplines[0]).toEqual({ label: 'All emergencies (112)', number: '112' });
  });

  test('still gives the helpline numbers when the map is down', async () => {
    global.fetch = jest.fn().mockResolvedValue(down);
    const res = await get('/emergency');
    expect(res.status).toBe(200);
    expect(res.body.nearbyAvailable).toBe(false);
    expect(res.body.helplines.length).toBeGreaterThan(3);
  });
});

describe('home screen overview', () => {
  test('returns weather, alerts and top headlines in one call', async () => {
    global.fetch = jest.fn().mockImplementation(async (url) => {
      const u = String(url);
      if (u.includes('open-meteo')) return json(forecast());
      if (u.includes('news.google.com')) return xml(rss([{ title: 'Metro extended - The Hindu', link: 'https://news.google.com/rss/articles/z1', source: 'The Hindu' }]));
      return down;
    });
    const res = await get('/overview');
    expect(res.status).toBe(200);
    expect(res.body.weather.current.temp).toBe(29);
    expect(res.body.news).toHaveLength(1);
    expect(res.body.alerts.some((a) => a.title === 'Heavy Rain Alert')).toBe(true);
  });

  test('a failing part does not break the others', async () => {
    global.fetch = jest.fn().mockImplementation(async (url) => (String(url).includes('open-meteo') ? json(forecast()) : down));
    const res = await get('/overview');
    expect(res.status).toBe(200);
    expect(res.body.news).toEqual([]);
    expect(res.body.weather).not.toBeNull();
  });
});
