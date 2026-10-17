const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    societyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Society', required: true },
    helpId: { type: mongoose.Schema.Types.ObjectId, ref: 'DailyHelp', required: true },
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ }, // society-local day of check-in
    checkIn: { type: Date, required: true },
    checkOut: { type: Date, default: null },
    markedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

schema.index({ helpId: 1, date: -1 });
schema.index({ societyId: 1, checkOut: 1 });

module.exports = mongoose.model('HelpAttendance', schema);
