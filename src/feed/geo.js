// ─── Location helpers ───────────────────────────────────────────────────────
// A "place" is { lat, lng, city, state, country } built from User.location
// (coordinates + free-text name) and User.address (structured).

const toRad = (deg) => (deg * Math.PI) / 180;
const norm = (value) => String(value || '').trim().toLowerCase();
const escapeRe = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const hasCoords = (place) => Boolean(place)
  && Number.isFinite(place.lat) && Number.isFinite(place.lng)
  && !(place.lat === 0 && place.lng === 0);

const haversineKm = (a, b) => {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};

// Whole-word match so 'goa' does not match 'goals'.
const containsPlace = (text, place) => {
  if (!text || !place) return false;
  return new RegExp(`(^|[^\\p{L}\\p{M}])${escapeRe(place)}([^\\p{L}\\p{M}]|$)`, 'iu').test(text);
};

// Builds a place from a User document (or a populated author).
const placeFromUser = (user) => {
  if (!user) return null;
  const address = user.address || {};
  const place = {
    lat: Number(user.location?.lat),
    lng: Number(user.location?.lng),
    city: norm(address.city),
    state: norm(address.state),
    country: norm(address.country),
  };
  // Fall back to the free-text location name, e.g. "Pune, Maharashtra, India".
  if (!place.city && !place.state && !place.country && user.location?.name) {
    const parts = String(user.location.name).split(',').map(norm).filter(Boolean);
    if (parts.length >= 1) place.city = parts[0];
    if (parts.length >= 3) place.state = parts[parts.length - 2];
    if (parts.length >= 2) place.country = parts[parts.length - 1];
  }
  return place;
};

const isKnown = (place) => Boolean(place) && (hasCoords(place) || place.city || place.state || place.country);

// How local an item is to the viewer: 1 same city / <25 km … 0.1 far away,
// 0.5 when either side's location is unknown.
const geoScore = (viewer, author, itemLocation = '') => {
  if (!isKnown(viewer)) return 0.5;
  let best = null;

  if (hasCoords(viewer) && hasCoords(author)) {
    const km = haversineKm(viewer, author);
    best = km <= 25 ? 1 : km <= 100 ? 0.8 : km <= 500 ? 0.5 : 0.2;
  }

  for (const [key, score] of [['city', 1], ['state', 0.7], ['country', 0.4]]) {
    const value = viewer[key];
    if (!value) continue;
    if ((author && author[key] === value) || containsPlace(itemLocation, value)) {
      best = Math.max(best ?? 0, score);
      break;
    }
  }

  if (best !== null) return best;
  return isKnown(author) || itemLocation ? 0.1 : 0.5;
};

module.exports = { haversineKm, placeFromUser, geoScore, containsPlace, hasCoords, isKnown, norm };
