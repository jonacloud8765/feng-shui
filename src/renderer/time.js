// Time-zone helpers built on Intl, so daylight-saving rules come from the
// system's time-zone database instead of hand-written offsets.

const partsFormatter = new Map();

function formatterFor(tz) {
  if (!partsFormatter.has(tz)) {
    partsFormatter.set(
      tz,
      new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
    );
  }
  return partsFormatter.get(tz);
}

// Offset of `tz` from UTC at instant `t`, in milliseconds.
export function tzOffset(t, tz) {
  const p = Object.fromEntries(formatterFor(tz).formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return asUtc - Math.floor(t / 1000) * 1000;
}

// "2026-12-24T18:00" as wall-clock time in `tz` (or local time when empty) -> epoch ms.
export function zonedToEpoch(local, tz) {
  if (!local) return NaN;
  if (!tz) return new Date(local).getTime();
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(local);
  if (!m) return NaN;
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0));
  let t = guess - tzOffset(guess, tz);
  // Recheck at the result in case the guess fell on the other side of a DST change.
  t = guess - tzOffset(t, tz);
  return t;
}

export function isValidZone(tz) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// "UTC+5:30" style label for an instant in a zone.
export function offsetLabel(t, tz) {
  const mins = Math.round(tzOffset(t, tz) / 60000);
  const sign = mins < 0 ? '−' : '+';
  const a = Math.abs(mins);
  return `UTC${sign}${Math.floor(a / 60)}${a % 60 ? ':' + String(a % 60).padStart(2, '0') : ''}`;
}

// Calendar-day difference between the zone and local time at instant t.
export function dayDifference(t, tz) {
  const fmt = (zone) => new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));
  const there = fmt(tz);
  const here = fmt(Intl.DateTimeFormat().resolvedOptions().timeZone);
  return Math.round((Date.parse(there) - Date.parse(here)) / 86400000);
}
