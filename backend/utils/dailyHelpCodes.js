// Daily gate codes for daily help (maid, cook, driver ...). Each helper gets a new six-digit code every day (society time).
// Anything that reads or checks a code calls renewCodes first, so yesterday's code never opens the gate by itself and
// no nightly job is needed. The morning mail (dailyHelpMail.js) also calls it so the new QR goes out early.
const crypto = require('crypto');
const DailyHelp = require('../models/DailyHelp');
const Society = require('../models/Society');
const { DEFAULT_TZ, todayIn, addDays } = require('./timezone');

// How many days back a helper's old code is still recognised (so a missed day does not lock them out of being identified).
const OLD_CODE_DAYS = 2;

const societyTz = async (societyId) => {
  const s = await Society.findById(societyId).select('timezone').lean();
  return (s && s.timezone) || DEFAULT_TZ;
};

const sixDigits = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');

// The conditional update means two requests at midnight cannot rotate the same helper twice.
// The code being replaced is kept as prevCode, so a helper who still says it can be identified.
const rotate = async (help, today) => {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const next = await DailyHelp.findOneAndUpdate(
        { _id: help._id, codeDate: { $ne: today } },
        { $set: { code: sixDigits(), codeDate: today, prevCode: help.code, prevCodeDate: help.codeDate } },
        { new: true }
      );
      if (next) {
        help.code = next.code;
        help.codeDate = today;
        help.prevCode = next.prevCode;
        help.prevCodeDate = next.prevCodeDate;
      } else {
        // eslint-disable-next-line no-await-in-loop
        const current = await DailyHelp.findById(help._id); // another request already rotated it
        if (current) {
          help.code = current.code;
          help.codeDate = current.codeDate;
          help.prevCode = current.prevCode;
          help.prevCodeDate = current.prevCodeDate;
        }
      }
      return;
    } catch (e) {
      if (e.code !== 11000) throw e; // the new code clashed with another helper's: draw again
    }
  }
  throw new Error('Could not renew the gate codes');
};

const renewCodes = async (societyId, tz, known) => {
  const today = todayIn(tz);
  const helpers = known || (await DailyHelp.find({ societyId, isActive: true, codeDate: { $ne: today } }).limit(2000)) || [];
  for (const h of helpers) {
    // eslint-disable-next-line no-await-in-loop
    if (h.codeDate !== today) await rotate(h, today);
  }
  return today;
};

/**
 * Finds the helper a code belongs to. Today's code is the normal case. If it is not today's, an older code of a helper
 * (up to OLD_CODE_DAYS back) still identifies them, so the guard can check them in and tell them today's code.
 * Returns { help, oldCode } or null.
 */
const findByCode = async (societyId, code, tz) => {
  const current = await DailyHelp.findOne({ societyId, code, isActive: true });
  if (current) return { help: current, oldCode: false };
  const today = todayIn(tz);
  const oldest = addDays(today, -OLD_CODE_DAYS);
  const old = await DailyHelp.findOne({ societyId, prevCode: code, isActive: true, prevCodeDate: { $gte: oldest } });
  return old ? { help: old, oldCode: true } : null;
};

module.exports = { societyTz, sixDigits, rotate, renewCodes, findByCode, OLD_CODE_DAYS };
