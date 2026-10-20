// One place that decides until when an invitation (its QR code and pass code) works.
//
//  - If the resident said when the guest will leave (plannedExit), the pass works until then.
//  - Otherwise it works for `validForHours` (24 by default) after the expected arrival, or after it was created.
//
// Both the guard's check-in and the guest's pass page use this, so they can never disagree.
const DEFAULT_VALID_HOURS = 24;
const MAX_VALID_HOURS = 24 * 30;
const HOUR = 3600 * 1000;

const validHours = (v) => Number(v.validForHours) || DEFAULT_VALID_HOURS;

const expiryOf = (v) => {
  if (v.plannedExit) return new Date(v.plannedExit);
  const from = v.expectedArrival || v.createdAt;
  return from ? new Date(new Date(from).getTime() + validHours(v) * HOUR) : null;
};

// Checks the resident's "expected to leave" against the arrival. Returns an error message, or '' when fine.
const checkPlannedExit = (plannedExit, expectedArrival, now = new Date()) => {
  if (!plannedExit) return '';
  const out = new Date(plannedExit);
  if (Number.isNaN(out.getTime())) return 'Pick a valid time for the visitor to leave.';
  const start = expectedArrival ? new Date(expectedArrival) : now;
  if (out <= start) return 'The leaving time must be after the arrival time.';
  if (out <= now) return 'The leaving time is already past. Pick a later time.';
  if (out - start > MAX_VALID_HOURS * HOUR) return 'A pass can cover at most 30 days.';
  return '';
};

module.exports = { DEFAULT_VALID_HOURS, MAX_VALID_HOURS, validHours, expiryOf, checkPlannedExit };
