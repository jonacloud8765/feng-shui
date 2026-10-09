// Shared weather presentation: WMO weather codes to words and line icons.

const S = 'fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"';
const sun = `<circle cx="12" cy="12" r="4.2" ${S}/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" ${S}/>`;
const moon = `<path d="M19.5 14.5A7.5 7.5 0 0 1 9.5 4.5a7.5 7.5 0 1 0 10 10z" ${S}/>`;
const cloud = (y = 0) => `<path d="M7 ${19 + y}h10.5a4 4 0 0 0 .4-8 6 6 0 0 0-11.6 1.6A3.3 3.3 0 0 0 7 ${19 + y}z" ${S}/>`;
const smallSun = `<circle cx="8" cy="8" r="3" ${S}/><path d="M8 2v1.3M2 8h1.3M3.8 3.8l.9.9M12.2 3.8l-.9.9" ${S}/>`;
const smallMoon = `<path d="M11 9.5A4.5 4.5 0 0 1 5.5 4a4.5 4.5 0 1 0 5.5 5.5z" ${S}/>`;
const drops = `<path d="M8.5 21.5l-1 1.5M12.5 21.5l-1 1.5M16.5 21.5l-1 1.5" ${S}/>`;
const flakes = `<path d="M8.5 22h.01M12.5 22.5h.01M16.5 22h.01" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>`;
const bolt = `<path d="M12.5 17.5l-2 3.5h3l-2 3" ${S}/>`;
const fog = `<path d="M4 16h16M6 19.5h12M4 12.5h16" ${S}/>`;

const svg = (body) => `<svg viewBox="0 0 24 25" aria-hidden="true">${body}</svg>`;

// Codes from https://open-meteo.com/en/docs (WMO 4677 subset).
export function describe(code, isDay = true) {
  const c = Number(code);
  if (c === 0) return { text: isDay ? 'Clear' : 'Clear night', icon: svg(isDay ? sun : moon) };
  if (c === 1) return { text: 'Mostly clear', icon: svg(isDay ? sun : moon) };
  if (c === 2) return { text: 'Partly cloudy', icon: svg((isDay ? smallSun : smallMoon) + cloud(1)) };
  if (c === 3) return { text: 'Overcast', icon: svg(cloud()) };
  if (c === 45 || c === 48) return { text: 'Fog', icon: svg(fog) };
  if (c >= 51 && c <= 57) return { text: 'Drizzle', icon: svg(cloud(-2) + drops) };
  if ((c >= 61 && c <= 67) || (c >= 80 && c <= 82)) return { text: c >= 65 || c === 82 ? 'Heavy rain' : 'Rain', icon: svg(cloud(-2) + drops) };
  if ((c >= 71 && c <= 77) || c === 85 || c === 86) return { text: 'Snow', icon: svg(cloud(-2) + flakes) };
  if (c >= 95) return { text: 'Thunderstorm', icon: svg(cloud(-4) + bolt) };
  return { text: 'Unknown', icon: svg(cloud()) };
}

export const temp = (c, unit) => (c === null || c === undefined || Number.isNaN(c) ? '–' : `${Math.round(unit === 'F' ? c * 9 / 5 + 32 : c)}°`);

export function ago(ts) {
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return 'Updated just now';
  if (m < 60) return `Updated ${m} min ago`;
  return `Updated ${new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
}
