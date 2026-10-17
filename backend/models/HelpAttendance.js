const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    societyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Society', required: true },
    helpId: { type: mongoose.Schema.Types.ObjectId, ref: 'DailyHelp', required: true },
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ }, // society-local day of check-in
    checkIn: { type: Date, required: true },
    checkOut: { type: Date, default: null },
    open: { type: Boolean, default: true }, // true until checked out; at most one open row per helper (unique index below)
    markedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

schema.index({ helpId: 1, date: -1 });
schema.index({ societyId: 1, checkOut: 1 });
// Two taps at the gate cannot leave two open visits for the same helper.
schema.index({ helpId: 1 }, { unique: true, partialFilterExpression: { open: true } });

module.exports = mongoose.model('HelpAttendance', schema);
