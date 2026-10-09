'use strict';

// Weather behind a small provider interface. A provider implements:
//   forecast({ lat, lon }) -> { tempC, code, isDay, highC, lowC, hourly[], timezone, updatedAt, source }
//   searchCities(query)    -> [{ name, region, country, lat, lon, timezone }]
// The default is Open-Meteo, which needs no API key or account. To use a
// different service, implement the same two methods and pass it to
// createWeatherService(). Nothing here invents data: on any failure the
// caller gets an error with a readable message.

const TTL = 15 * 60 * 1000;

const openMeteo = {
  name: 'Open-Meteo',
  async forecast({ lat, lon }) {
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.search = new URLSearchParams({
      latitude: lat.toFixed(4),
      longitude: lon.toFixed(4),
      current: 'temperature_2m,weather_code,is_day',
      hourly: 'temperature_2m,weather_code,is_day',
      daily: 'temperature_2m_max,temperature_2m_min',
      timezone: 'auto',
      forecast_days: '2',
    }).toString();
    const data = await getJson(url);
    if (!data.current || typeof data.current.temperature_2m !== 'number') throw new Error('The weather service returned no current conditions.');
    // Hourly times are local to the location; find the current hour by string compare.
    const nowLocal = data.current.time.slice(0, 13);
    const start = Math.max(0, data.hourly.time.findIndex((t) => t.slice(0, 13) >= nowLocal));
    const hourly = data.hourly.time.slice(start + 1, start + 13).map((t, i) => ({
      time: t,
      tempC: data.hourly.temperature_2m[start + 1 + i],
      code: data.hourly.weather_code[start + 1 + i],
      isDay: !!data.hourly.is_day[start + 1 + i],
    }));
    return {
      tempC: data.current.temperature_2m,
      code: data.current.weather_code,
      isDay: !!data.current.is_day,
      highC: data.daily?.temperature_2m_max?.[0] ?? null,
      lowC: data.daily?.temperature_2m_min?.[0] ?? null,
      hourly,
      timezone: data.timezone,
      updatedAt: Date.now(),
      source: 'Open-Meteo',
    };
  },
  async searchCities(query) {
    const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
    url.search = new URLSearchParams({ name: query, count: '10', format: 'json', language: 'en' }).toString();
    const data = await getJson(url);
    return (data.results || []).map((r) => ({
      name: r.name,
      region: r.admin1 || '',
      country: r.country || r.country_code || '',
      lat: r.latitude,
      lon: r.longitude,
      timezone: r.timezone,
    }));
  },
};

async function getJson(url) {
  let res;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  } catch (err) {
    throw new Error(err.name === 'TimeoutError' ? 'The weather service took too long to answer.' : 'No connection to the weather service.');
  }
  if (!res.ok) throw new Error(`The weather service answered with an error (${res.status}).`);
  return res.json();
}

function createWeatherService(provider = openMeteo) {
  const cache = new Map();
  const inflight = new Map();
  return {
    provider: provider.name,
    async forecast(loc, { force = false } = {}) {
      if (!loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lon)) throw new Error('No location chosen.');
      const key = `${loc.lat.toFixed(2)},${loc.lon.toFixed(2)}`;
      const hit = cache.get(key);
      if (!force && hit && Date.now() - hit.updatedAt < TTL) return hit;
      if (inflight.has(key)) return inflight.get(key);
      const p = provider.forecast(loc).then(
        (r) => { cache.set(key, r); inflight.delete(key); return r; },
        (e) => { inflight.delete(key); throw e; },
      );
      inflight.set(key, p);
      return p;
    },
    searchCities: (q) => (q && q.trim().length >= 2 ? provider.searchCities(q.trim()) : Promise.resolve([])),
  };
}

module.exports = { createWeatherService, openMeteo };
