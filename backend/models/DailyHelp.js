const mongoose = require('mongoose');

const KINDS = ['maid', 'cook', 'driver', 'nanny', 'gardener', 'cleaner', 'tutor', 'other'];

const schema = new mongoose.Schema(
  {
    societyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Society', required: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    phone: { type: String, trim: true, maxlength: 20, default: '' },
    kind: { type: String, enum: KINDS, default: 'maid' },
    photo: String,
    // The code the helper shows the guard at the gate today. It changes every day (society time) and is unique within a society.
    code: { type: String, required: true, match: /^\d{6}$/ },
    // The society-local day (YYYY-MM-DD) this code belongs to. A different day means the code is out of date and gets replaced.
    codeDate: { type: String, match: /^\d{4}-\d{2}-\d{2}$/ },
    // Yesterday's code. A helper who says it at the gate is still recognised, and the guard is told today's code to pass on.
    prevCode: { type: String, match: /^\d{6}$/ },
    prevCodeDate: { type: String, match: /^\d{4}-\d{2}-\d{2}$/ },
    // Where the daily QR code is mailed (optional). Without it the households get the mail.
    email: { type: String, trim: true, lowercase: true, maxlength: 120 },
    // The day (society time) the code was last mailed, so it goes out once a day.
    mailedDate: { type: String, match: /^\d{4}-\d{2}-\d{2}$/ },
    // The flats they work in. One helper can work for several households.
    residents: {
      type: [new mongoose.Schema({ userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, flat: String }, { _id: false })],
      default: []
    },
    isActive: { type: Boolean, default: true },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

schema.index({ societyId: 1, code: 1 }, { unique: true });
schema.index({ 'residents.userId': 1 });

module.exports = mongoose.model('DailyHelp', schema);
module.exports.KINDS = KINDS;
