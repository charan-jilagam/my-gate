// Small location helpers. Pure functions.

const EARTH_RADIUS_M = 6371000;
const toRad = (deg) => (deg * Math.PI) / 180;

const isCoord = (lat, lng) =>
  typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

// Straight-line distance in metres between two points (haversine).
const distanceM = (a, b) => {
  if (!a || !b || !isCoord(a.lat, a.lng) || !isCoord(b.lat, b.lng)) return null;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h))));
};

// Where a shift should be worked: the post's own pin when it has one, otherwise the society's.
// Returns { lat, lng, radiusMeters, label } or null when nothing has been pinned yet.
const placeFor = (post, society) => {
  if (post && isCoord(post.lat, post.lng)) return { lat: post.lat, lng: post.lng, radiusMeters: post.radiusMeters || 150, label: post.name };
  const loc = society && society.location;
  if (loc && isCoord(loc.lat, loc.lng)) return { lat: loc.lat, lng: loc.lng, radiusMeters: loc.radiusMeters || 300, label: loc.label || 'the society' };
  return null;
};

// How far a point is from a place and whether that is outside the allowed radius.
// The GPS accuracy is allowed for, so a poor fix near the edge is not called "outside".
const checkPlace = (point, place) => {
  if (!place || !point) return { distanceM: null, outside: null };
  const d = distanceM(point, place);
  if (d === null) return { distanceM: null, outside: null };
  const slack = Math.min(Math.max(Number(point.accuracy) || 0, 0), 100);
  return { distanceM: d, outside: d - slack > place.radiusMeters };
};

module.exports = { distanceM, isCoord, placeFor, checkPlace };
